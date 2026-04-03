// Package service provides PUBG Developer API integration.
//
// Requires PUBG_API_KEY environment variable to be set.
// Free tier: https://developer.pubg.com/ — 10 req/min.
// Shard defaults to "steam" (PC). Override with PUBG_SHARD env var.
package service

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"time"
)

// PUBGClient is a minimal client for the PUBG Developer API.
type PUBGClient struct {
	apiKey  string
	shard   string
	baseURL string
	http    *http.Client
}

func NewPUBGClient(apiKey, shard string) *PUBGClient {
	if shard == "" {
		shard = "steam"
	}
	return &PUBGClient{
		apiKey:  apiKey,
		shard:   shard,
		baseURL: "https://api.pubg.com",
		http:    &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *PUBGClient) get(path string, out interface{}) error {
	req, err := http.NewRequest("GET", c.baseURL+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Accept", "application/vnd.api+json")

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("PUBG API request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("not_found")
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("PUBG API %d: %s", resp.StatusCode, string(body))
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// PlayerStats holds the aggregated season stats for a player.
type PlayerStats struct {
	GameName    string
	Matches     int
	Kills       int
	Assists     int
	TotalDamage float64
	AvgDamage   float64
	KDA         float64
}

// GetPlayerSeasonStats fetches season stats for a player by name.
// It queries squad-fpp first; falls back to squad if not available.
func (c *PUBGClient) GetPlayerSeasonStats(playerName string) (*PlayerStats, error) {
	// Step 1: resolve name → accountId
	searchPath := fmt.Sprintf("/shards/%s/players?filter[playerNames]=%s",
		c.shard, url.QueryEscape(playerName))
	var playersResp struct {
		Data []struct {
			ID string `json:"id"`
		} `json:"data"`
	}
	if err := c.get(searchPath, &playersResp); err != nil {
		return nil, fmt.Errorf("lookup player %q: %w", playerName, err)
	}
	if len(playersResp.Data) == 0 {
		return nil, fmt.Errorf("player_not_found")
	}
	accountID := playersResp.Data[0].ID

	// Step 2: get current season
	seasonID, err := c.getCurrentSeasonID()
	if err != nil {
		return nil, fmt.Errorf("get current season: %w", err)
	}

	// Step 3: get season stats
	statsPath := fmt.Sprintf("/shards/%s/players/%s/seasons/%s", c.shard, accountID, seasonID)
	var statsResp struct {
		Data struct {
			Attributes struct {
				GameModeStats map[string]struct {
					RoundsPlayed int     `json:"roundsPlayed"`
					Kills        int     `json:"kills"`
					Assists      int     `json:"assists"`
					Losses       int     `json:"losses"`
					DamageDealt  float64 `json:"damageDealt"`
				} `json:"gameModeStats"`
			} `json:"attributes"`
		} `json:"data"`
	}
	if err := c.get(statsPath, &statsResp); err != nil {
		return nil, fmt.Errorf("get season stats: %w", err)
	}

	// Aggregate across squad-fpp and squad modes
	modes := []string{"squad-fpp", "squad", "duo-fpp", "duo", "solo-fpp", "solo"}
	var totalMatches, totalKills, totalAssists int
	var totalDamage float64
	for _, mode := range modes {
		if s, ok := statsResp.Data.Attributes.GameModeStats[mode]; ok {
			totalMatches += s.RoundsPlayed
			totalKills += s.Kills
			totalAssists += s.Assists
			totalDamage += s.DamageDealt
		}
	}

	avgDamage := 0.0
	if totalMatches > 0 {
		avgDamage = totalDamage / float64(totalMatches)
	}

	return &PlayerStats{
		GameName:    playerName,
		Matches:     totalMatches,
		Kills:       totalKills,
		Assists:     totalAssists,
		TotalDamage: totalDamage,
		AvgDamage:   avgDamage,
	}, nil
}

func (c *PUBGClient) getCurrentSeasonID() (string, error) {
	path := fmt.Sprintf("/shards/%s/seasons", c.shard)
	var resp struct {
		Data []struct {
			ID         string `json:"id"`
			Attributes struct {
				IsCurrentSeason bool `json:"isCurrentSeason"`
			} `json:"attributes"`
		} `json:"data"`
	}
	if err := c.get(path, &resp); err != nil {
		return "", err
	}
	for _, s := range resp.Data {
		if s.Attributes.IsCurrentSeason {
			return s.ID, nil
		}
	}
	if len(resp.Data) > 0 {
		return resp.Data[len(resp.Data)-1].ID, nil
	}
	return "", fmt.Errorf("no seasons found")
}

// ─── Ranking ─────────────────────────────────────────────────────────────────

// RankEntry holds a player's ranked stats for an event.
type RankEntry struct {
	RegID       int64
	GameName    string
	Matches     int
	Kills       int
	Assists     int
	TotalDamage float64
	AvgDamage   float64
	Score       float64
	RankNo      int
	RankLabel   string
}

// CalcScore computes a composite score: kills × 10 + avgDamage × 0.5 + assists × 2.
// Priority: kills > avg damage > assists (weights reflect this order).
func CalcScore(kills int, avgDamage float64, assists int) float64 {
	return float64(kills)*10 + avgDamage*0.5 + float64(assists)*2
}

// RefreshEventRankings fetches season stats for all active registrations of an
// event, computes scores and labels (战神 = 1st, 战犯 = last), and writes
// results to the event_rankings table.
func RefreshEventRankings(db *sql.DB, client *PUBGClient, eventID int64) ([]RankEntry, error) {
	// Fetch active registrations (assigned + waitlist)
	rows, err := db.Query(`
		SELECT id, name FROM registrations
		WHERE event_id=? AND status != 'cancelled'
		ORDER BY created_at
	`, eventID)
	if err != nil {
		return nil, fmt.Errorf("query registrations: %w", err)
	}
	defer rows.Close()

	type reg struct {
		id   int64
		name string
	}
	var regs []reg
	for rows.Next() {
		var r reg
		if err := rows.Scan(&r.id, &r.name); err == nil {
			regs = append(regs, r)
		}
	}
	if len(regs) == 0 {
		return nil, nil
	}

	// Fetch stats for each player (rate-limited: 10 req/min free tier)
	var entries []RankEntry
	for _, r := range regs {
		stats, err := client.GetPlayerSeasonStats(r.name)
		if err != nil {
			// Player not found in PUBG: record with zero stats
			entries = append(entries, RankEntry{
				RegID:    r.id,
				GameName: r.name,
			})
			// Respect rate limit
			time.Sleep(6 * time.Second)
			continue
		}
		entries = append(entries, RankEntry{
			RegID:       r.id,
			GameName:    r.name,
			Matches:     stats.Matches,
			Kills:       stats.Kills,
			Assists:     stats.Assists,
			TotalDamage: stats.TotalDamage,
			AvgDamage:   stats.AvgDamage,
			Score:       CalcScore(stats.Kills, stats.AvgDamage, stats.Assists),
		})
		time.Sleep(6 * time.Second) // 10 req/min
	}

	// Sort by score descending
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].Score != entries[j].Score {
			return entries[i].Score > entries[j].Score
		}
		return entries[i].Kills > entries[j].Kills
	})

	// Assign ranks and labels
	for i := range entries {
		entries[i].RankNo = i + 1
		if i == 0 && len(entries) > 1 {
			entries[i].RankLabel = "战神"
		} else if i == len(entries)-1 && len(entries) > 1 {
			entries[i].RankLabel = "战犯"
		}
	}

	// Persist to event_rankings
	now := time.Now().Format(time.RFC3339)
	for _, e := range entries {
		db.Exec(`
			INSERT INTO event_rankings (event_id, reg_id, game_name, matches, kills, assists, total_damage, score, rank_no, rank_label, refreshed_at)
			VALUES (?,?,?,?,?,?,?,?,?,?,?)
			ON CONFLICT(event_id, reg_id) DO UPDATE SET
				game_name=excluded.game_name, matches=excluded.matches,
				kills=excluded.kills, assists=excluded.assists,
				total_damage=excluded.total_damage, score=excluded.score,
				rank_no=excluded.rank_no, rank_label=excluded.rank_label,
				refreshed_at=excluded.refreshed_at
		`, eventID, e.RegID, e.GameName, e.Matches, e.Kills, e.Assists, e.TotalDamage, e.Score, e.RankNo, e.RankLabel, now)
	}

	return entries, nil
}

// GetEventRankings reads cached rankings from the DB.
func GetEventRankings(db *sql.DB, eventID int64) ([]RankEntry, error) {
	rows, err := db.Query(`
		SELECT reg_id, game_name, matches, kills, assists, total_damage, score, rank_no, COALESCE(rank_label,'')
		FROM event_rankings WHERE event_id=? ORDER BY rank_no ASC
	`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var entries []RankEntry
	for rows.Next() {
		var e RankEntry
		if err := rows.Scan(&e.RegID, &e.GameName, &e.Matches, &e.Kills, &e.Assists, &e.TotalDamage, &e.Score, &e.RankNo, &e.RankLabel); err == nil {
			if e.Matches > 0 {
				e.AvgDamage = e.TotalDamage / float64(e.Matches)
			}
			entries = append(entries, e)
		}
	}
	return entries, nil
}

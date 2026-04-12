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
	"math"
	"net/http"
	"net/url"
	"sort"
	"time"
)

// pubgRateLimitDelay is the delay between API calls to stay within the free tier
// rate limit of 10 requests per minute (= 6 seconds between requests).
const pubgRateLimitDelay = 6 * time.Second

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
	Deaths      int
	Assists     int
	TotalDamage float64
	AvgDamage   float64
	KDA         float64
}

// GetPlayerSeasonStats fetches season stats for a player by name.
// It aggregates across all game modes.
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

	modes := []string{"squad-fpp", "squad", "duo-fpp", "duo", "solo-fpp", "solo"}
	var totalMatches, totalKills, totalDeaths, totalAssists int
	var totalDamage float64
	for _, mode := range modes {
		if s, ok := statsResp.Data.Attributes.GameModeStats[mode]; ok {
			totalMatches += s.RoundsPlayed
			totalKills += s.Kills
			totalDeaths += s.Losses
			totalAssists += s.Assists
			totalDamage += s.DamageDealt
		}
	}

	avgDamage := 0.0
	kda := 0.0
	if totalMatches > 0 {
		avgDamage = totalDamage / float64(totalMatches)
	}
	kda = float64(totalKills+totalAssists) / math.Max(float64(totalDeaths), 1)

	return &PlayerStats{
		GameName:    playerName,
		Matches:     totalMatches,
		Kills:       totalKills,
		Deaths:      totalDeaths,
		Assists:     totalAssists,
		TotalDamage: totalDamage,
		AvgDamage:   avgDamage,
		KDA:         kda,
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

// ─── Match History ────────────────────────────────────────────────────────────

// MatchPlayerStats holds a single player's stats for one match.
type MatchPlayerStats struct {
	MatchID   string
	CreatedAt time.Time
	GameMode  string
	Kills     int
	Deaths    int     // 1 if player died, 0 if survived
	Assists   int
	Damage    float64
}

// getPlayerAccountIDAndMatches returns account ID and list of recent match IDs for a player.
func (c *PUBGClient) getPlayerAccountIDAndMatches(playerName string) (accountID string, matchIDs []string, err error) {
	searchPath := fmt.Sprintf("/shards/%s/players?filter[playerNames]=%s",
		c.shard, url.QueryEscape(playerName))
	var playersResp struct {
		Data []struct {
			ID            string `json:"id"`
			Relationships struct {
				Matches struct {
					Data []struct {
						Type string `json:"type"`
						ID   string `json:"id"`
					} `json:"data"`
				} `json:"matches"`
			} `json:"relationships"`
		} `json:"data"`
	}
	if err := c.get(searchPath, &playersResp); err != nil {
		return "", nil, fmt.Errorf("lookup player %q: %w", playerName, err)
	}
	if len(playersResp.Data) == 0 {
		return "", nil, fmt.Errorf("player_not_found")
	}
	player := playersResp.Data[0]
	ids := make([]string, 0, len(player.Relationships.Matches.Data))
	for _, m := range player.Relationships.Matches.Data {
		ids = append(ids, m.ID)
	}
	return player.ID, ids, nil
}

// getMatchPlayerStats fetches stats for a specific player (by accountID) in a specific match.
func (c *PUBGClient) getMatchPlayerStats(matchID, accountID string) (*MatchPlayerStats, error) {
	path := fmt.Sprintf("/shards/%s/matches/%s", c.shard, matchID)
	var matchResp struct {
		Data struct {
			Attributes struct {
				CreatedAt string `json:"createdAt"`
				GameMode  string `json:"gameMode"`
			} `json:"attributes"`
		} `json:"data"`
		Included []json.RawMessage `json:"included"`
	}
	if err := c.get(path, &matchResp); err != nil {
		return nil, err
	}

	createdAt, _ := time.Parse(time.RFC3339, matchResp.Data.Attributes.CreatedAt)

	// Scan included array for participant matching accountID
	for _, raw := range matchResp.Included {
		var item struct {
			Type       string `json:"type"`
			Attributes struct {
				Stats struct {
					PlayerID    string  `json:"playerId"`
					Kills       int     `json:"kills"`
					Assists     int     `json:"assists"`
					DeathType   string  `json:"deathType"`
					DamageDealt float64 `json:"damageDealt"`
				} `json:"stats"`
			} `json:"attributes"`
		}
		if err := json.Unmarshal(raw, &item); err != nil || item.Type != "participant" {
			continue
		}
		if item.Attributes.Stats.PlayerID != accountID {
			continue
		}
		deaths := 0
		if item.Attributes.Stats.DeathType != "alive" {
			deaths = 1
		}
		return &MatchPlayerStats{
			MatchID:   matchID,
			CreatedAt: createdAt,
			GameMode:  matchResp.Data.Attributes.GameMode,
			Kills:     item.Attributes.Stats.Kills,
			Deaths:    deaths,
			Assists:   item.Attributes.Stats.Assists,
			Damage:    item.Attributes.Stats.DamageDealt,
		}, nil
	}
	return nil, fmt.Errorf("player not found in match %s", matchID)
}

// PlayerMatchRangeStats holds aggregated stats for matches within a time range.
type PlayerMatchRangeStats struct {
	GameName    string
	MatchCount  int
	Kills       int
	Deaths      int
	Assists     int
	TotalDamage float64
	KDA         float64
	AvgDamage   float64
}

// GetPlayerMatchesInTimeRange fetches and aggregates all recent matches for a player
// that fall within the [from, to] time window.
func (c *PUBGClient) GetPlayerMatchesInTimeRange(playerName string, from, to time.Time) (*PlayerMatchRangeStats, error) {
	accountID, matchIDs, err := c.getPlayerAccountIDAndMatches(playerName)
	if err != nil {
		return nil, err
	}

	result := &PlayerMatchRangeStats{GameName: playerName}
	for _, matchID := range matchIDs {
		time.Sleep(pubgRateLimitDelay)
		ms, err := c.getMatchPlayerStats(matchID, accountID)
		if err != nil {
			continue
		}
		if ms.CreatedAt.Before(from) || ms.CreatedAt.After(to) {
			continue
		}
		result.MatchCount++
		result.Kills += ms.Kills
		result.Deaths += ms.Deaths
		result.Assists += ms.Assists
		result.TotalDamage += ms.Damage
	}
	if result.MatchCount > 0 {
		result.KDA = float64(result.Kills+result.Assists) / math.Max(float64(result.Deaths), 1)
		result.AvgDamage = result.TotalDamage / float64(result.MatchCount)
	}
	return result, nil
}

// ─── Player Stats Cache (前台展示) ─────────────────────────────────────────────

// CachedPlayerStats holds cached season stats for frontend display.
type CachedPlayerStats struct {
	Found    bool
	Matches  int
	Kills    int
	Assists  int
	KDA      float64
}

// CachePlayerSeasonStats asynchronously fetches and caches season stats for gameName.
// Should be called in a goroutine after registration.
func CachePlayerSeasonStats(db *sql.DB, client *PUBGClient, gameName string) {
	stats, err := client.GetPlayerSeasonStats(gameName)
	if err != nil {
		// Player not found or API error: cache as not-found
		db.Exec(`
			INSERT INTO player_stats_cache (game_name, found, refreshed_at)
			VALUES (?, 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
			ON CONFLICT(game_name) DO UPDATE SET
				found=0, matches=0, kills=0, assists=0, total_damage=0, kda=0,
				refreshed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now')
		`, gameName)
		return
	}
	// Use KDA already computed in GetPlayerSeasonStats (kills+assists / max(deaths, 1))
	db.Exec(`
		INSERT INTO player_stats_cache (game_name, matches, kills, assists, total_damage, kda, found, refreshed_at)
		VALUES (?, ?, ?, ?, ?, ?, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		ON CONFLICT(game_name) DO UPDATE SET
			matches=excluded.matches, kills=excluded.kills, assists=excluded.assists,
			total_damage=excluded.total_damage, kda=excluded.kda, found=1,
			refreshed_at=excluded.refreshed_at
	`, gameName, stats.Matches, stats.Kills, stats.Assists, stats.TotalDamage, stats.KDA)
}

// GetCachedPlayerStats reads cached stats from DB. Returns nil if not cached yet.
func GetCachedPlayerStats(db *sql.DB, gameName string) *CachedPlayerStats {
	var s CachedPlayerStats
	var found int
	err := db.QueryRow(`
		SELECT found, matches, kills, assists, kda FROM player_stats_cache WHERE game_name=?
	`, gameName).Scan(&found, &s.Matches, &s.Kills, &s.Assists, &s.KDA)
	if err != nil {
		return nil
	}
	s.Found = found == 1
	return &s
}

// ─── Ranking ─────────────────────────────────────────────────────────────────

// RankEntry holds a player's ranked stats for an event.
type RankEntry struct {
	RegID       int64
	GameName    string
	Matches     int
	Kills       int
	Deaths      int
	Assists     int
	TotalDamage float64
	AvgDamage   float64
	KDA         float64
	Score       float64
	RankNo      int
	RankLabel   string
}

// CalcScore computes a composite score: KDA * 15 + avgDamage * 0.05.
func CalcScore(kills, deaths, assists int, avgDamage float64) float64 {
	kda := float64(kills+assists) / math.Max(float64(deaths), 1)
	return kda*15 + avgDamage*0.05
}

// assignRankLabels assigns tier labels based on rank position among N players.
// Labels: 战神 (1st), 精锐 (2nd if N≥4), 骨干 (middle), 菜鸟 (N-1 if N≥5), 战犯 (last)
// Players with 0 matches get "缺席".
func assignRankLabels(entries []RankEntry) {
	n := len(entries)
	for i := range entries {
		if entries[i].Matches == 0 {
			entries[i].RankLabel = "缺席"
			continue
		}
		switch {
		case i == 0 && n >= 2:
			entries[i].RankLabel = "战神"
		case i == 1 && n >= 4:
			entries[i].RankLabel = "精锐"
		case i == n-2 && n >= 5:
			entries[i].RankLabel = "菜鸟"
		case i == n-1 && n >= 2:
			entries[i].RankLabel = "战犯"
		default:
			entries[i].RankLabel = "骨干"
		}
	}
}

// parseLocalDateTime parses a "YYYY-MM-DDTHH:MM" string as Asia/Shanghai local time.
func parseLocalDateTime(s string) (time.Time, error) {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		loc = time.UTC
	}
	return time.ParseInLocation("2006-01-02T15:04", s, loc)
}

// RefreshEventRankings fetches stats for all active registrations of an event,
// computes scores and labels, and writes results to event_rankings.
// If actualStart/actualEnd are non-empty, uses match history for that time range;
// otherwise falls back to current-season stats.
func RefreshEventRankings(db *sql.DB, client *PUBGClient, eventID int64, actualStart, actualEnd string) ([]RankEntry, error) {
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

	useTimeRange := actualStart != "" && actualEnd != ""
	var from, to time.Time
	if useTimeRange {
		from, err = parseLocalDateTime(actualStart)
		if err != nil {
			useTimeRange = false
		} else {
			to, err = parseLocalDateTime(actualEnd)
			if err != nil {
				useTimeRange = false
			}
		}
	}

	var entries []RankEntry
	for _, r := range regs {
		time.Sleep(pubgRateLimitDelay)
		if useTimeRange {
			rangeStats, err := client.GetPlayerMatchesInTimeRange(r.name, from, to)
			if err != nil {
				entries = append(entries, RankEntry{RegID: r.id, GameName: r.name})
				continue
			}
			score := CalcScore(rangeStats.Kills, rangeStats.Deaths, rangeStats.Assists, rangeStats.AvgDamage)
			entries = append(entries, RankEntry{
				RegID:       r.id,
				GameName:    r.name,
				Matches:     rangeStats.MatchCount,
				Kills:       rangeStats.Kills,
				Deaths:      rangeStats.Deaths,
				Assists:     rangeStats.Assists,
				TotalDamage: rangeStats.TotalDamage,
				AvgDamage:   rangeStats.AvgDamage,
				KDA:         rangeStats.KDA,
				Score:       score,
			})
		} else {
			stats, err := client.GetPlayerSeasonStats(r.name)
			if err != nil {
				entries = append(entries, RankEntry{RegID: r.id, GameName: r.name})
				continue
			}
			score := CalcScore(stats.Kills, stats.Deaths, stats.Assists, stats.AvgDamage)
			kda := float64(stats.Kills+stats.Assists) / math.Max(float64(stats.Deaths), 1)
			entries = append(entries, RankEntry{
				RegID:       r.id,
				GameName:    r.name,
				Matches:     stats.Matches,
				Kills:       stats.Kills,
				Deaths:      stats.Deaths,
				Assists:     stats.Assists,
				TotalDamage: stats.TotalDamage,
				AvgDamage:   stats.AvgDamage,
				KDA:         kda,
				Score:       score,
			})
		}
	}

	// Sort by score descending, then kills descending
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].Score != entries[j].Score {
			return entries[i].Score > entries[j].Score
		}
		return entries[i].Kills > entries[j].Kills
	})

	// Assign rank numbers and labels
	for i := range entries {
		entries[i].RankNo = i + 1
	}
	assignRankLabels(entries)

	// Persist to event_rankings
	// Clear old entries first to handle changed reg_ids
	db.Exec(`DELETE FROM event_rankings WHERE event_id=?`, eventID)
	now := time.Now().Format(time.RFC3339)
	for _, e := range entries {
		db.Exec(`
			INSERT INTO event_rankings (event_id, reg_id, game_name, matches, kills, deaths, assists, total_damage, score, rank_no, rank_label, refreshed_at)
			VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
			ON CONFLICT(event_id, reg_id) DO UPDATE SET
				game_name=excluded.game_name, matches=excluded.matches,
				kills=excluded.kills, deaths=excluded.deaths,
				assists=excluded.assists, total_damage=excluded.total_damage,
				score=excluded.score, rank_no=excluded.rank_no,
				rank_label=excluded.rank_label, refreshed_at=excluded.refreshed_at
		`, eventID, e.RegID, e.GameName, e.Matches, e.Kills, e.Deaths, e.Assists, e.TotalDamage, e.Score, e.RankNo, e.RankLabel, now)
	}

	return entries, nil
}

// ─── Public Stats (前台战绩查询) ──────────────────────────────────────────────

// SeasonInfo holds basic info about a PUBG season.
type SeasonInfo struct {
	ID              string `json:"id"`
	IsCurrentSeason bool   `json:"isCurrentSeason"`
}

// GetAllSeasons returns all available seasons for the configured shard.
func (c *PUBGClient) GetAllSeasons() ([]SeasonInfo, error) {
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
		return nil, err
	}
	seasons := make([]SeasonInfo, 0, len(resp.Data))
	for _, s := range resp.Data {
		seasons = append(seasons, SeasonInfo{
			ID:              s.ID,
			IsCurrentSeason: s.Attributes.IsCurrentSeason,
		})
	}
	return seasons, nil
}

// PlayerStatsOverview holds season stats and recent match IDs for frontend display.
type PlayerStatsOverview struct {
	AccountID      string   `json:"accountId"`
	PlayerName     string   `json:"playerName"`
	SeasonID       string   `json:"seasonId"`
	Matches        int      `json:"matches"`
	Kills          int      `json:"kills"`
	Deaths         int      `json:"deaths"`
	Assists        int      `json:"assists"`
	TotalDamage    float64  `json:"totalDamage"`
	AvgDamage      float64  `json:"avgDamage"`
	KDA            float64  `json:"kda"`
	RecentMatchIDs []string `json:"recentMatchIds"`
}

// GetPlayerStatsOverview fetches season stats and recent match IDs for a player.
// If seasonID is empty, the current season is used.
func (c *PUBGClient) GetPlayerStatsOverview(playerName string, seasonID string) (*PlayerStatsOverview, error) {
	// Step 1: resolve name → accountId + recent match IDs
	accountID, matchIDs, err := c.getPlayerAccountIDAndMatches(playerName)
	if err != nil {
		return nil, err
	}

	// Step 2: resolve season
	if seasonID == "" {
		seasonID, err = c.getCurrentSeasonID()
		if err != nil {
			return nil, fmt.Errorf("get current season: %w", err)
		}
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

	modes := []string{"squad-fpp", "squad", "duo-fpp", "duo", "solo-fpp", "solo"}
	var totalMatches, totalKills, totalDeaths, totalAssists int
	var totalDamage float64
	for _, mode := range modes {
		if s, ok := statsResp.Data.Attributes.GameModeStats[mode]; ok {
			totalMatches += s.RoundsPlayed
			totalKills += s.Kills
			totalDeaths += s.Losses
			totalAssists += s.Assists
			totalDamage += s.DamageDealt
		}
	}

	avgDamage := 0.0
	kda := 0.0
	if totalMatches > 0 {
		avgDamage = totalDamage / float64(totalMatches)
	}
	kda = float64(totalKills+totalAssists) / math.Max(float64(totalDeaths), 1)

	// Return up to 20 recent match IDs
	limit := 20
	if len(matchIDs) < limit {
		limit = len(matchIDs)
	}

	return &PlayerStatsOverview{
		AccountID:      accountID,
		PlayerName:     playerName,
		SeasonID:       seasonID,
		Matches:        totalMatches,
		Kills:          totalKills,
		Deaths:         totalDeaths,
		Assists:        totalAssists,
		TotalDamage:    totalDamage,
		AvgDamage:      avgDamage,
		KDA:            kda,
		RecentMatchIDs: matchIDs[:limit],
	}, nil
}

// MatchParticipantDetail holds detailed stats for one participant in a match.
type MatchParticipantDetail struct {
	Name          string  `json:"name"`
	Kills         int     `json:"kills"`
	Assists       int     `json:"assists"`
	DBNOs         int     `json:"dbnos"`
	Damage        float64 `json:"damage"`
	Survived      bool    `json:"survived"`
	TimeSurvived  float64 `json:"timeSurvived"`
	WalkDistance  float64 `json:"walkDistance"`
	RideDistance  float64 `json:"rideDistance"`
	Heals         int     `json:"heals"`
	Boosts        int     `json:"boosts"`
	Revives       int     `json:"revives"`
	HeadshotKills int     `json:"headshotKills"`
	WinPlace      int     `json:"winPlace"`
}

// MatchDetail holds detailed information for a single match.
type MatchDetail struct {
	MatchID      string                   `json:"matchId"`
	CreatedAt    time.Time                `json:"createdAt"`
	GameMode     string                   `json:"gameMode"`
	MapName      string                   `json:"mapName"`
	Duration     int                      `json:"duration"`
	PlayerRank   int                      `json:"playerRank"`
	TotalTeams   int                      `json:"totalTeams"`
	TotalPlayers int                      `json:"totalPlayers"`
	Player       MatchParticipantDetail   `json:"player"`
	Teammates    []MatchParticipantDetail `json:"teammates"`
}

// GetMatchDetail fetches detailed stats for a player in a specific match.
// Finds the player by name in the match participants.
func (c *PUBGClient) GetMatchDetail(matchID, playerName string) (*MatchDetail, error) {
	path := fmt.Sprintf("/shards/%s/matches/%s", c.shard, matchID)
	var matchResp struct {
		Data struct {
			ID         string `json:"id"`
			Attributes struct {
				CreatedAt string `json:"createdAt"`
				GameMode  string `json:"gameMode"`
				MapName   string `json:"mapName"`
				Duration  int    `json:"duration"`
			} `json:"attributes"`
		} `json:"data"`
		Included []json.RawMessage `json:"included"`
	}
	if err := c.get(path, &matchResp); err != nil {
		return nil, err
	}

	createdAt, _ := time.Parse(time.RFC3339, matchResp.Data.Attributes.CreatedAt)

	// Parse all participants and rosters
	type rawParticipant struct {
		id    string
		stats struct {
			PlayerID      string
			Name          string
			Kills         int
			Assists       int
			DBNOs         int
			DamageDealt   float64
			DeathType     string
			TimeSurvived  float64
			WalkDistance  float64
			RideDistance  float64
			Heals         int
			Boosts        int
			Revives       int
			HeadshotKills int
			WinPlace      int
		}
	}
	type rawRoster struct {
		rank           int
		participantIDs []string
	}

	participants := map[string]*rawParticipant{}
	rosters := []rawRoster{}

	for _, raw := range matchResp.Included {
		var typed struct {
			Type string `json:"type"`
			ID   string `json:"id"`
		}
		if err := json.Unmarshal(raw, &typed); err != nil {
			continue
		}

		switch typed.Type {
		case "participant":
			var item struct {
				ID         string `json:"id"`
				Attributes struct {
					Stats struct {
						PlayerID      string  `json:"playerId"`
						Name          string  `json:"name"`
						Kills         int     `json:"kills"`
						Assists       int     `json:"assists"`
						DBNOs         int     `json:"DBNOs"`
						DamageDealt   float64 `json:"damageDealt"`
						DeathType     string  `json:"deathType"`
						TimeSurvived  float64 `json:"timeSurvived"`
						WalkDistance  float64 `json:"walkDistance"`
						RideDistance  float64 `json:"rideDistance"`
						Heals         int     `json:"heals"`
						Boosts        int     `json:"boosts"`
						Revives       int     `json:"revives"`
						HeadshotKills int     `json:"headshotKills"`
						WinPlace      int     `json:"winPlace"`
					} `json:"stats"`
				} `json:"attributes"`
			}
			if err := json.Unmarshal(raw, &item); err != nil {
				continue
			}
			p := &rawParticipant{id: item.ID}
			p.stats.PlayerID = item.Attributes.Stats.PlayerID
			p.stats.Name = item.Attributes.Stats.Name
			p.stats.Kills = item.Attributes.Stats.Kills
			p.stats.Assists = item.Attributes.Stats.Assists
			p.stats.DBNOs = item.Attributes.Stats.DBNOs
			p.stats.DamageDealt = item.Attributes.Stats.DamageDealt
			p.stats.DeathType = item.Attributes.Stats.DeathType
			p.stats.TimeSurvived = item.Attributes.Stats.TimeSurvived
			p.stats.WalkDistance = item.Attributes.Stats.WalkDistance
			p.stats.RideDistance = item.Attributes.Stats.RideDistance
			p.stats.Heals = item.Attributes.Stats.Heals
			p.stats.Boosts = item.Attributes.Stats.Boosts
			p.stats.Revives = item.Attributes.Stats.Revives
			p.stats.HeadshotKills = item.Attributes.Stats.HeadshotKills
			p.stats.WinPlace = item.Attributes.Stats.WinPlace
			participants[item.ID] = p

		case "roster":
			var item struct {
				Attributes struct {
					Rank int `json:"rank"`
				} `json:"attributes"`
				Relationships struct {
					Participants struct {
						Data []struct {
							ID string `json:"id"`
						} `json:"data"`
					} `json:"participants"`
				} `json:"relationships"`
			}
			if err := json.Unmarshal(raw, &item); err != nil {
				continue
			}
			r := rawRoster{rank: item.Attributes.Rank}
			for _, pd := range item.Relationships.Participants.Data {
				r.participantIDs = append(r.participantIDs, pd.ID)
			}
			rosters = append(rosters, r)
		}
	}

	// Find the player and their roster
	var playerParticipant *rawParticipant
	for _, p := range participants {
		if p.stats.Name == playerName {
			playerParticipant = p
			break
		}
	}
	if playerParticipant == nil {
		return nil, fmt.Errorf("player %q not found in match", playerName)
	}

	// winPlace from participant stats is the reliable placement field in PUBG API v2
	playerRank := playerParticipant.stats.WinPlace
	var teammates []MatchParticipantDetail
	for _, r := range rosters {
		inRoster := false
		for _, pid := range r.participantIDs {
			if pid == playerParticipant.id {
				inRoster = true
				break
			}
		}
		if inRoster {
			for _, pid := range r.participantIDs {
				if pid == playerParticipant.id {
					continue
				}
				if tm, ok := participants[pid]; ok {
					teammates = append(teammates, MatchParticipantDetail{
						Name:          tm.stats.Name,
						Kills:         tm.stats.Kills,
						Assists:       tm.stats.Assists,
						DBNOs:         tm.stats.DBNOs,
						Damage:        tm.stats.DamageDealt,
						Survived:      tm.stats.DeathType == "alive",
						TimeSurvived:  tm.stats.TimeSurvived,
						WalkDistance:  tm.stats.WalkDistance,
						RideDistance:  tm.stats.RideDistance,
						Heals:         tm.stats.Heals,
						Boosts:        tm.stats.Boosts,
						Revives:       tm.stats.Revives,
						HeadshotKills: tm.stats.HeadshotKills,
						WinPlace:      tm.stats.WinPlace,
					})
				}
			}
			break
		}
	}

	p := playerParticipant
	return &MatchDetail{
		MatchID:      matchID,
		CreatedAt:    createdAt,
		GameMode:     matchResp.Data.Attributes.GameMode,
		MapName:      matchResp.Data.Attributes.MapName,
		Duration:     matchResp.Data.Attributes.Duration,
		PlayerRank:   playerRank,
		TotalTeams:   len(rosters),
		TotalPlayers: len(participants),
		Player: MatchParticipantDetail{
			Name:          p.stats.Name,
			Kills:         p.stats.Kills,
			Assists:       p.stats.Assists,
			DBNOs:         p.stats.DBNOs,
			Damage:        p.stats.DamageDealt,
			Survived:      p.stats.DeathType == "alive",
			TimeSurvived:  p.stats.TimeSurvived,
			WalkDistance:  p.stats.WalkDistance,
			RideDistance:  p.stats.RideDistance,
			Heals:         p.stats.Heals,
			Boosts:        p.stats.Boosts,
			Revives:       p.stats.Revives,
			HeadshotKills: p.stats.HeadshotKills,
			WinPlace:      p.stats.WinPlace,
		},
		Teammates: teammates,
	}, nil
}

// GetEventRankings reads cached rankings from the DB.
func GetEventRankings(db *sql.DB, eventID int64) ([]RankEntry, error) {
	rows, err := db.Query(`
		SELECT reg_id, game_name, matches, kills, deaths, assists, total_damage, score, rank_no, COALESCE(rank_label,'')
		FROM event_rankings WHERE event_id=? ORDER BY rank_no ASC
	`, eventID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var entries []RankEntry
	for rows.Next() {
		var e RankEntry
		if err := rows.Scan(&e.RegID, &e.GameName, &e.Matches, &e.Kills, &e.Deaths, &e.Assists, &e.TotalDamage, &e.Score, &e.RankNo, &e.RankLabel); err == nil {
			if e.Matches > 0 {
				e.AvgDamage = e.TotalDamage / float64(e.Matches)
				e.KDA = float64(e.Kills+e.Assists) / math.Max(float64(e.Deaths), 1)
			}
			entries = append(entries, e)
		}
	}
	return entries, nil
}

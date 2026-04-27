package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"time"
)

type matchCacheEntryV2 struct {
	MatchID      string
	CreatedAt    string
	GameMode     string
	TelemetryURL string
	PayloadJSON  string
}

type telemetryFeaturesV2 struct {
	DamageTaken      float64
	DamageDealt      float64
	FireCount        int
	DamageHitEvents  int
	ReviveCount      int
	MakeGroggyCount  int
	TradeRatio       float64
	HitEfficiency    float64
	Status           string
}

type telemetryCharacter struct {
	Name string `json:"name"`
}

func (c *PUBGClient) getRawWithContext(ctx context.Context, path string) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", c.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.apiKey)
	req.Header.Set("Accept", "application/vnd.api+json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("PUBG API request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("not_found")
	}
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("PUBG API %d: %s", resp.StatusCode, string(body))
	}
	return io.ReadAll(resp.Body)
}

func parseTrackedMatchStatsPayload(matchID string, payload []byte, trackedNames map[string]struct{}) (*trackedMatchStats, error) {
	var matchResp struct {
		Data struct {
			Attributes struct {
				CreatedAt string `json:"createdAt"`
				GameMode  string `json:"gameMode"`
			} `json:"attributes"`
		} `json:"data"`
		Included []json.RawMessage `json:"included"`
	}
	if err := json.Unmarshal(payload, &matchResp); err != nil {
		return nil, err
	}

	createdAt, _ := time.Parse(time.RFC3339, matchResp.Data.Attributes.CreatedAt)
	players := make(map[string]MatchPlayerStats)
	participantNames := make(map[string]string)
	rosters := make([][]string, 0)
	telemetryURL := ""

	// 第一遍：建立 participantID → playerName 映射，以及受跟踪玩家的统计
	for _, raw := range matchResp.Included {
		var typed struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(raw, &typed); err != nil {
			continue
		}
		if typed.Type != "participant" {
			continue
		}
		var item struct {
			ID         string `json:"id"`
			Attributes struct {
				Stats struct {
					Name          string  `json:"name"`
					Kills         int     `json:"kills"`
					Assists       int     `json:"assists"`
					DBNOs         int     `json:"DBNOs"`
					HeadshotKills int     `json:"headshotKills"`
					WinPlace      int     `json:"winPlace"`
					DeathType     string  `json:"deathType"`
					DamageDealt   float64 `json:"damageDealt"`
					TimeSurvived  float64 `json:"timeSurvived"`
				} `json:"stats"`
			} `json:"attributes"`
		}
		if err := json.Unmarshal(raw, &item); err != nil {
			continue
		}
		participantNames[item.ID] = item.Attributes.Stats.Name
		name := item.Attributes.Stats.Name
		if _, ok := trackedNames[name]; !ok {
			continue
		}
		deaths := 0
		if item.Attributes.Stats.DeathType != "alive" {
			deaths = 1
		}
		players[name] = MatchPlayerStats{
			MatchID:       matchID,
			CreatedAt:     createdAt,
			GameMode:      matchResp.Data.Attributes.GameMode,
			Kills:         item.Attributes.Stats.Kills,
			Deaths:        deaths,
			Assists:       item.Attributes.Stats.Assists,
			DBNOs:         item.Attributes.Stats.DBNOs,
			HeadshotKills: item.Attributes.Stats.HeadshotKills,
			WinPlace:      item.Attributes.Stats.WinPlace,
			Damage:        item.Attributes.Stats.DamageDealt,
			TimeAlive:     item.Attributes.Stats.TimeSurvived,
		}
	}

	// 第二遍：用完整的 participantNames 构建 roster 和 telemetryURL
	for _, raw := range matchResp.Included {
		var typed struct {
			Type string `json:"type"`
		}
		if err := json.Unmarshal(raw, &typed); err != nil {
			continue
		}

		switch typed.Type {
		case "roster":
			var item struct {
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
			trackedRoster := make([]string, 0)
			for _, participant := range item.Relationships.Participants.Data {
				name := participantNames[participant.ID]
				if _, ok := trackedNames[name]; ok {
					trackedRoster = append(trackedRoster, name)
				}
			}
			if len(trackedRoster) > 0 {
				rosters = append(rosters, trackedRoster)
			}

		case "asset":
			var item struct {
				Attributes struct {
					URL  string `json:"URL"`
					Name string `json:"name"`
				} `json:"attributes"`
			}
			if err := json.Unmarshal(raw, &item); err != nil {
				continue
			}
			if telemetryURL == "" || item.Attributes.Name == "telemetry" {
				telemetryURL = item.Attributes.URL
			}
		}
	}

	return &trackedMatchStats{
		MatchID:      matchID,
		CreatedAt:    createdAt,
		GameMode:     matchResp.Data.Attributes.GameMode,
		TelemetryURL: telemetryURL,
		Players:      players,
		Rosters:      rosters,
	}, nil
}

func loadMatchCacheV2(db *sql.DB, matchID string) (*matchCacheEntryV2, error) {
	var entry matchCacheEntryV2
	err := db.QueryRow(`
		SELECT match_id, created_at, game_mode, telemetry_url, payload_json
		FROM pubg_match_cache_v2 WHERE match_id=?
	`, matchID).Scan(&entry.MatchID, &entry.CreatedAt, &entry.GameMode, &entry.TelemetryURL, &entry.PayloadJSON)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &entry, nil
}

func saveMatchCacheV2(db *sql.DB, shard string, entry *matchCacheEntryV2) error {
	_, err := db.Exec(`
		INSERT INTO pubg_match_cache_v2 (match_id, shard, created_at, game_mode, telemetry_url, payload_json, refreshed_at)
		VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		ON CONFLICT(match_id) DO UPDATE SET
			shard=excluded.shard,
			created_at=excluded.created_at,
			game_mode=excluded.game_mode,
			telemetry_url=excluded.telemetry_url,
			payload_json=excluded.payload_json,
			refreshed_at=excluded.refreshed_at
	`, entry.MatchID, shard, entry.CreatedAt, entry.GameMode, entry.TelemetryURL, entry.PayloadJSON)
	return err
}

func getTrackedMatchStatsCached(ctx context.Context, db *sql.DB, client *PUBGClient, matchID string, trackedNames map[string]struct{}) (*trackedMatchStats, error) {
	if cached, err := loadMatchCacheV2(db, matchID); err == nil && cached != nil {
		return parseTrackedMatchStatsPayload(matchID, []byte(cached.PayloadJSON), trackedNames)
	}

	payload, err := client.getRawWithContext(ctx, fmt.Sprintf("/shards/%s/matches/%s", client.shard, matchID))
	if err != nil {
		return nil, err
	}
	stats, err := parseTrackedMatchStatsPayload(matchID, payload, trackedNames)
	if err != nil {
		return nil, err
	}
	_ = saveMatchCacheV2(db, client.shard, &matchCacheEntryV2{
		MatchID:      matchID,
		CreatedAt:    stats.CreatedAt.Format(time.RFC3339),
		GameMode:     stats.GameMode,
		TelemetryURL: stats.TelemetryURL,
		PayloadJSON:  string(payload),
	})
	return stats, nil
}

func qualifyingRosterPlayers(matchStats *trackedMatchStats, minTrackedPlayers int) map[string]struct{} {
	qualified := make(map[string]struct{})
	for _, roster := range matchStats.Rosters {
		if len(roster) < minTrackedPlayers {
			continue
		}
		for _, name := range roster {
			qualified[name] = struct{}{}
		}
	}
	return qualified
}

func loadTelemetryFeaturesV2(db *sql.DB, matchID string, playerNames map[string]struct{}) (map[string]telemetryFeaturesV2, error) {
	features := make(map[string]telemetryFeaturesV2, len(playerNames))
	for name := range playerNames {
		var item telemetryFeaturesV2
		err := db.QueryRow(`
			SELECT damage_taken, damage_dealt, fire_count, damage_hit_events,
			       revive_count, make_groggy_count, trade_ratio, hit_efficiency, status
			FROM pubg_player_match_features_v2
			WHERE match_id=? AND game_name=?
		`, matchID, name).Scan(
			&item.DamageTaken,
			&item.DamageDealt,
			&item.FireCount,
			&item.DamageHitEvents,
			&item.ReviveCount,
			&item.MakeGroggyCount,
			&item.TradeRatio,
			&item.HitEfficiency,
			&item.Status,
		)
		if err == sql.ErrNoRows {
			continue
		}
		if err != nil {
			return nil, err
		}
		features[name] = item
	}
	return features, nil
}

func saveTelemetryFeaturesV2(db *sql.DB, matchID string, features map[string]telemetryFeaturesV2) error {
	for name, feature := range features {
		_, err := db.Exec(`
			INSERT INTO pubg_player_match_features_v2 (
				match_id, game_name, damage_taken, damage_dealt, fire_count, damage_hit_events,
				revive_count, make_groggy_count, trade_ratio, hit_efficiency, status, refreshed_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
			ON CONFLICT(match_id, game_name) DO UPDATE SET
				damage_taken=excluded.damage_taken,
				damage_dealt=excluded.damage_dealt,
				fire_count=excluded.fire_count,
				damage_hit_events=excluded.damage_hit_events,
				revive_count=excluded.revive_count,
				make_groggy_count=excluded.make_groggy_count,
				trade_ratio=excluded.trade_ratio,
				hit_efficiency=excluded.hit_efficiency,
				status=excluded.status,
				refreshed_at=excluded.refreshed_at
		`, matchID, name, feature.DamageTaken, feature.DamageDealt, feature.FireCount, feature.DamageHitEvents, feature.ReviveCount, feature.MakeGroggyCount, feature.TradeRatio, feature.HitEfficiency, feature.Status)
		if err != nil {
			return err
		}
	}
	return nil
}

func (c *PUBGClient) fetchTelemetryFeatures(ctx context.Context, telemetryURL string, trackedNames map[string]struct{}) (map[string]telemetryFeaturesV2, error) {
	req, err := http.NewRequestWithContext(ctx, "GET", telemetryURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/vnd.api+json")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("telemetry %d: %s", resp.StatusCode, string(body))
	}

	features := make(map[string]telemetryFeaturesV2, len(trackedNames))
	for name := range trackedNames {
		features[name] = telemetryFeaturesV2{Status: "ready"}
	}

	dec := json.NewDecoder(resp.Body)
	tok, err := dec.Token()
	if err != nil {
		return nil, err
	}
	if delim, ok := tok.(json.Delim); !ok || delim != '[' {
		return nil, fmt.Errorf("telemetry payload is not an array")
	}

	for dec.More() {
		var raw json.RawMessage
		if err := dec.Decode(&raw); err != nil {
			return nil, err
		}
		var base struct {
			Type string `json:"_T"`
		}
		if err := json.Unmarshal(raw, &base); err != nil {
			continue
		}

		switch base.Type {
		case "LogPlayerTakeDamage":
			var event struct {
				Attacker telemetryCharacter `json:"attacker"`
				Victim   telemetryCharacter `json:"victim"`
				Damage   float64            `json:"damage"`
			}
			if err := json.Unmarshal(raw, &event); err != nil {
				continue
			}
			if item, ok := features[event.Victim.Name]; ok {
				item.DamageTaken += event.Damage
				features[event.Victim.Name] = item
			}
			if event.Attacker.Name != "" {
				if item, ok := features[event.Attacker.Name]; ok {
					item.DamageDealt += event.Damage
					item.DamageHitEvents++
					features[event.Attacker.Name] = item
				}
			}

		case "LogWeaponFireCount":
			var event struct {
				Character telemetryCharacter `json:"character"`
				FireCount int                `json:"fireCount"`
			}
			if err := json.Unmarshal(raw, &event); err != nil {
				continue
			}
			if item, ok := features[event.Character.Name]; ok {
				item.FireCount += event.FireCount
				features[event.Character.Name] = item
			}

		case "LogPlayerRevive":
			var event struct {
				Reviver telemetryCharacter `json:"reviver"`
			}
			if err := json.Unmarshal(raw, &event); err != nil {
				continue
			}
			if item, ok := features[event.Reviver.Name]; ok {
				item.ReviveCount++
				features[event.Reviver.Name] = item
			}

		case "LogPlayerMakeGroggy":
			var event struct {
				Attacker telemetryCharacter `json:"attacker"`
			}
			if err := json.Unmarshal(raw, &event); err != nil {
				continue
			}
			if item, ok := features[event.Attacker.Name]; ok {
				item.MakeGroggyCount++
				features[event.Attacker.Name] = item
			}
		}
	}

	for name, item := range features {
		if item.DamageDealt > 0 {
			item.TradeRatio = item.DamageDealt / math.Max(item.DamageTaken, 1)
		}
		if item.FireCount > 0 {
			item.HitEfficiency = item.DamageDealt / float64(item.FireCount)
		}
		features[name] = item
	}

	return features, nil
}

func getTelemetryFeaturesCached(ctx context.Context, db *sql.DB, client *PUBGClient, matchID, telemetryURL string, playerNames map[string]struct{}) (map[string]telemetryFeaturesV2, error) {
	features, err := loadTelemetryFeaturesV2(db, matchID, playerNames)
	if err != nil {
		return nil, err
	}
	missing := make(map[string]struct{})
	for name := range playerNames {
		if _, ok := features[name]; !ok {
			missing[name] = struct{}{}
		}
	}
	if len(missing) == 0 {
		return features, nil
	}
	if telemetryURL == "" {
		return features, nil
	}
	fetched, err := client.fetchTelemetryFeatures(ctx, telemetryURL, missing)
	if err != nil {
		return nil, err
	}
	if err := saveTelemetryFeaturesV2(db, matchID, fetched); err != nil {
		return nil, err
	}
	for name, feature := range fetched {
		features[name] = feature
	}
	return features, nil
}
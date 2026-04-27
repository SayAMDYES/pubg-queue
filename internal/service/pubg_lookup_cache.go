package service

import (
	"database/sql"
	"encoding/json"
	"time"
)

// playerLookupTTL 控制 player→accountId+matchIds 缓存的有效期。
// PUBG 官方推荐 5–10 分钟（设计稿 §7）。
const playerLookupTTL = 5 * time.Minute

// loadCachedPlayerLookups 批量读取本地 lookup cache，仅返回 TTL 内仍有效的条目。
func loadCachedPlayerLookups(db *sql.DB, shard string, names []string) map[string]playerLookup {
	out := make(map[string]playerLookup, len(names))
	if db == nil || len(names) == 0 {
		return out
	}
	cutoff := time.Now().Add(-playerLookupTTL).UTC().Format("2006-01-02T15:04:05.000Z")
	for _, name := range names {
		var accountID, matchIDsJSON, refreshedAt string
		err := db.QueryRow(`
			SELECT account_id, match_ids, refreshed_at
			FROM pubg_player_lookup_cache
			WHERE shard=? AND player_name=?
		`, shard, name).Scan(&accountID, &matchIDsJSON, &refreshedAt)
		if err != nil {
			continue
		}
		if refreshedAt < cutoff {
			continue
		}
		var matchIDs []string
		if matchIDsJSON != "" {
			_ = json.Unmarshal([]byte(matchIDsJSON), &matchIDs)
		}
		out[name] = playerLookup{AccountID: accountID, MatchIDs: matchIDs}
	}
	return out
}

// saveCachedPlayerLookup 写入或更新单个玩家的 lookup 缓存。
func saveCachedPlayerLookup(db *sql.DB, shard, playerName string, lookup playerLookup) {
	if db == nil || playerName == "" {
		return
	}
	matchIDsJSON := "[]"
	if len(lookup.MatchIDs) > 0 {
		if buf, err := json.Marshal(lookup.MatchIDs); err == nil {
			matchIDsJSON = string(buf)
		}
	}
	_, _ = db.Exec(`
		INSERT INTO pubg_player_lookup_cache (shard, player_name, account_id, match_ids, refreshed_at)
		VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
		ON CONFLICT(shard, player_name) DO UPDATE SET
			account_id=excluded.account_id,
			match_ids=excluded.match_ids,
			refreshed_at=excluded.refreshed_at
	`, shard, playerName, lookup.AccountID, matchIDsJSON)
}

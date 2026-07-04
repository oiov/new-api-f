// One-off operational tool: refund consume logs that were charged but produced
// zero output (completion_tokens=0) during the 2026-06-29 18:30-20:00 CST upstream
// instability window. Wallet-billed logs only. Idempotent (safe to re-run).
//
// Run dry-run:  go run ./cmd/refundtool
// Apply:        go run ./cmd/refundtool -apply
package main

import (
	"flag"
	"fmt"
	"sort"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"

	"github.com/joho/godotenv"
	"gorm.io/gorm"
)

const (
	defaultWindowStart = int64(1782729000) // 2026-06-29 18:30:00 CST
	defaultWindowEnd   = int64(1782734400) // 2026-06-29 20:00:00 CST
	defaultBatchTag    = "refund-2026-06-29-1830-2000"
	defaultReasonCode  = "server_fluctuation_zero_output"
)

func main() {
	apply := flag.Bool("apply", false, "actually perform refunds (default: dry-run)")
	windowStart := flag.Int64("start", defaultWindowStart, "window start (unix seconds, inclusive)")
	windowEnd := flag.Int64("end", defaultWindowEnd, "window end (unix seconds, exclusive)")
	batchTag := flag.String("batch", defaultBatchTag, "batch tag used for idempotency and audit")
	reasonCode := flag.String("reason", defaultReasonCode, "reason code recorded on refund logs")
	flag.Parse()

	if *windowEnd <= *windowStart {
		panic(fmt.Sprintf("invalid window: end (%d) must be greater than start (%d)", *windowEnd, *windowStart))
	}
	fmt.Printf("config: start=%d end=%d batch=%q reason=%q apply=%v\n",
		*windowStart, *windowEnd, *batchTag, *reasonCode, *apply)

	// ---- init (mirror main.InitResources, minus migrations / web bootstrap) ----
	_ = godotenv.Load(".env")
	common.InitEnv()
	common.SkipAutoMigrate = true // NEVER migrate prod from this tool
	if err := model.InitDB(); err != nil {
		panic(err)
	}
	if err := model.InitLogDB(); err != nil {
		panic(err)
	}
	if err := common.InitRedisClient(); err != nil {
		panic(err)
	}

	// ---- 1. load candidate consume logs in window ----
	// Mirror the team's billing-export "stream zero-output" exclusion predicate
	// (see model/log.go: is_stream = true AND completion_tokens = 0 AND quota > 0,
	// excluding non-chat models). Only streaming chat/responses/claude requests can
	// hit the estimated-prompt-token fallback bug; non-chat models (image/tts/embed/
	// rerank/audio) legitimately report zero completion and must NOT be refunded.
	nonChatModels := model.GetNonChatModelNames()
	fmt.Printf("non-chat models excluded: %d\n", len(nonChatModels))
	q := model.LOG_DB.Where(
		"type = ? AND is_stream = ? AND created_at >= ? AND created_at < ? AND completion_tokens = 0 AND quota > 0",
		model.LogTypeConsume, true, *windowStart, *windowEnd,
	)
	if len(nonChatModels) > 0 {
		q = q.Where("model_name NOT IN ?", nonChatModels)
	}
	var logs []model.Log
	if err := q.Find(&logs).Error; err != nil {
		panic(err)
	}

	// ---- 2. keep wallet-billed only ----
	wallet := make([]model.Log, 0, len(logs))
	subSkipped := 0
	for _, lg := range logs {
		src := ""
		if lg.Other != "" {
			var m map[string]any
			if err := common.UnmarshalJsonStr(lg.Other, &m); err == nil {
				if v, ok := m["billing_source"].(string); ok {
					src = v
				}
			}
		}
		if src == "wallet" {
			wallet = append(wallet, lg)
		} else {
			subSkipped++
		}
	}

	// ---- 3. idempotency: collect already-refunded original log ids ----
	already := loadAlreadyRefunded(*batchTag)

	// ---- partition into to-refund vs skipped ----
	toRefund := make([]model.Log, 0, len(wallet))
	dup := 0
	for _, lg := range wallet {
		if already[lg.Id] {
			dup++
			continue
		}
		toRefund = append(toRefund, lg)
	}

	// ---- report ----
	var totalQuota int64
	perUser := map[int]int64{}
	perUserCnt := map[int]int{}
	for _, lg := range toRefund {
		totalQuota += int64(lg.Quota)
		perUser[lg.UserId] += int64(lg.Quota)
		perUserCnt[lg.UserId]++
	}
	fmt.Printf("window [%d,%d) | candidates(type=2,comp=0,quota>0): %d | wallet: %d | subscription-skipped: %d\n",
		*windowStart, *windowEnd, len(logs), len(wallet), subSkipped)
	fmt.Printf("already-refunded(idempotent skip): %d | TO REFUND: %d | total quota: %d (~$%.2f)\n",
		dup, len(toRefund), totalQuota, float64(totalQuota)/float64(common.QuotaPerUnit))
	uids := make([]int, 0, len(perUser))
	for u := range perUser {
		uids = append(uids, u)
	}
	sort.Slice(uids, func(i, j int) bool { return perUser[uids[i]] > perUser[uids[j]] })
	for _, u := range uids {
		fmt.Printf("  user %-6d n=%-3d quota=%-10d ~$%.2f\n", u, perUserCnt[u], perUser[u], float64(perUser[u])/float64(common.QuotaPerUnit))
	}

	if !*apply {
		fmt.Println("\n[DRY-RUN] no changes made. Re-run with -apply to execute.")
		return
	}
	if len(toRefund) == 0 {
		fmt.Println("\nnothing to refund.")
		return
	}

	// ---- 4. apply: one transaction per original log (atomic + idempotent) ----
	affectedUsers := map[int]bool{}
	tokenKeys := map[int]string{} // tokenId -> key, for cache invalidation
	done, failed := 0, 0
	for _, lg := range toRefund {
		err := model.DB.Transaction(func(tx *gorm.DB) error {
			// re-check inside tx to avoid double refund on concurrent re-run
			var existing int64
			if err := tx.Model(&model.Log{}).
				Where("type = ? AND other LIKE ?", model.LogTypeRefund,
					fmt.Sprintf("%%\"refund_for_log_id\":%d,%%", lg.Id)).
				Count(&existing).Error; err != nil {
				return err
			}
			if existing > 0 {
				return nil // already refunded
			}
			q := lg.Quota
			// user balance (money) + reverse usage stats
			if err := tx.Model(&model.User{}).Where("id = ?", lg.UserId).Updates(map[string]interface{}{
				"quota":         gorm.Expr("quota + ?", q),
				"used_quota":    gorm.Expr("used_quota - ?", q),
				"request_count": gorm.Expr("request_count - ?", 1),
			}).Error; err != nil {
				return err
			}
			// token usage stats (unlimited tokens -> stat only, but keep truthful)
			if lg.TokenId > 0 {
				if err := tx.Model(&model.Token{}).Where("id = ?", lg.TokenId).Updates(map[string]interface{}{
					"remain_quota": gorm.Expr("remain_quota + ?", q),
					"used_quota":   gorm.Expr("used_quota - ?", q),
				}).Error; err != nil {
					return err
				}
			}
			// channel usage stat
			if lg.ChannelId > 0 {
				if err := tx.Model(&model.Channel{}).Where("id = ?", lg.ChannelId).
					Update("used_quota", gorm.Expr("used_quota - ?", q)).Error; err != nil {
					return err
				}
			}
			// audit refund log (type=6)
			otherMap := map[string]any{
				"refund_for_log_id": lg.Id,
				"reason":            *reasonCode,
				"batch":             *batchTag,
				"refunded_quota":    q,
			}
			otherBytes, _ := common.Marshal(otherMap)
			rlog := &model.Log{
				UserId:    lg.UserId,
				Username:  lg.Username,
				CreatedAt: common.GetTimestamp(),
				Type:      model.LogTypeRefund,
				Content: fmt.Sprintf("服务器波动导致输出为空(completion_tokens=0)，退还扣费 %d（原消费日志ID %d，模型 %s，批次 %s）",
					q, lg.Id, lg.ModelName, *batchTag),
				ModelName: lg.ModelName,
				TokenName: lg.TokenName,
				TokenId:   lg.TokenId,
				ChannelId: lg.ChannelId,
				Group:     lg.Group,
				Quota:     q,
				Other:     string(otherBytes),
			}
			return tx.Create(rlog).Error
		})
		if err != nil {
			failed++
			fmt.Printf("  FAILED log %d (user %d): %v\n", lg.Id, lg.UserId, err)
			continue
		}
		done++
		affectedUsers[lg.UserId] = true
		if lg.TokenId > 0 {
			tokenKeys[lg.TokenId] = ""
		}
	}

	// ---- 5. invalidate caches (DB is source of truth; drop stale cache) ----
	for uid := range affectedUsers {
		if err := model.InvalidateUserCache(uid); err != nil {
			fmt.Printf("  warn: invalidate user cache %d: %v\n", uid, err)
		}
	}
	// token cache: delete by HMAC(key) so next validation rebuilds full hash from DB
	for tid := range tokenKeys {
		var tk model.Token
		if err := model.DB.Where("id = ?", tid).First(&tk).Error; err != nil {
			continue
		}
		if common.RedisEnabled && tk.Key != "" {
			_ = common.RedisDelKey(fmt.Sprintf("token:%s", common.GenerateHMAC(tk.Key)))
		}
	}

	fmt.Printf("\nDONE. refunded=%d failed=%d users=%d tokens=%d\n",
		done, failed, len(affectedUsers), len(tokenKeys))
}

// loadAlreadyRefunded scans prior type=6 refund logs of this batch and returns
// the set of original log ids already refunded.
func loadAlreadyRefunded(batchTag string) map[int]bool {
	out := map[int]bool{}
	var rows []model.Log
	if err := model.LOG_DB.Where("type = ? AND other LIKE ?", model.LogTypeRefund,
		"%"+batchTag+"%").Find(&rows).Error; err != nil {
		return out
	}
	for _, r := range rows {
		var m map[string]any
		if err := common.UnmarshalJsonStr(r.Other, &m); err == nil {
			if v, ok := m["refund_for_log_id"]; ok {
				switch n := v.(type) {
				case float64:
					out[int(n)] = true
				case int:
					out[n] = true
				}
			}
		}
	}
	return out
}

package model

import (
	"crypto/rand"
	"database/sql"
	"errors"
	"fmt"
	"math/big"
	"net/mail"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	ActivityLotteryRoundStatusDraft   = "draft"
	ActivityLotteryRoundStatusOpen    = "open"
	ActivityLotteryRoundStatusDrawn   = "drawn"
	ActivityLotteryRoundStatusExpired = "expired" // 到期未达成开奖条件
	ActivityLotteryRoundStatusClosed  = "closed"
)

type ActivityLotteryRound struct {
	Id                            int     `json:"id" gorm:"primaryKey;autoIncrement"`
	Title                         string  `json:"title" gorm:"type:varchar(128);not null;default:''"`
	Prize                         string  `json:"prize" gorm:"type:text;not null;default:''"`
	PrizeContent                  string  `json:"prize_content" gorm:"type:text;not null;default:''"`
	JoinSources                   string  `json:"join_sources" gorm:"type:varchar(128);not null;default:'manual'"`
	JoinTopupMinMoney             float64 `json:"join_topup_min_money" gorm:"not null;default:0"`
	JoinTopupScope                string  `json:"join_topup_scope" gorm:"type:varchar(16);not null;default:'today'"`
	JoinTopupUnit                 string  `json:"join_topup_unit" gorm:"type:varchar(16);not null;default:'money'"`
	JoinDailyConsumeMinMoney      float64 `json:"join_daily_consume_min_money" gorm:"not null;default:0"`
	JoinDailyConsumeScope         string  `json:"join_daily_consume_scope" gorm:"type:varchar(16);not null;default:'today'"`
	JoinDailyConsumeThresholdUnit string  `json:"join_daily_consume_threshold_unit" gorm:"type:varchar(16);not null;default:'money'"`
	Published                     bool    `json:"published" gorm:"not null;default:false;index"`
	Status                        string  `json:"status" gorm:"type:varchar(32);not null;default:'draft';index"`
	StartAt                       int64   `json:"start_at" gorm:"bigint;not null;default:0;index"`
	EndAt                         int64   `json:"end_at" gorm:"bigint;not null;default:0;index"`
	MinParticipants               int     `json:"min_participants" gorm:"not null;default:0"`
	WinnerCount                   int     `json:"winner_count" gorm:"not null;default:0"`
	ParticipantCount              int64   `json:"participant_count" gorm:"not null;default:0"`
	DrawnAt                       int64   `json:"drawn_at" gorm:"bigint;not null;default:0;index"`
	LastError                     string  `json:"last_error" gorm:"type:text;not null;default:''"`
	CreatedAt                     int64   `json:"created_at" gorm:"bigint;index"`
	UpdatedAt                     int64   `json:"updated_at" gorm:"bigint;index"`
}

type ActivityLotteryEntry struct {
	Id        int    `json:"id" gorm:"primaryKey;autoIncrement"`
	RoundId   int    `json:"round_id" gorm:"not null;index;uniqueIndex:idx_activity_lottery_round_user"`
	UserId    int    `json:"user_id" gorm:"not null;index;uniqueIndex:idx_activity_lottery_round_user"`
	Source    string `json:"source" gorm:"type:varchar(32);not null;default:'';index"`
	CreatedAt int64  `json:"created_at" gorm:"bigint;index"`
}

type ActivityLotteryWinner struct {
	Id          int    `json:"id" gorm:"primaryKey;autoIncrement"`
	RoundId     int    `json:"round_id" gorm:"not null;index"`
	UserId      int    `json:"user_id" gorm:"not null;index"`
	MaskedName  string `json:"masked_name" gorm:"type:varchar(128);not null;default:''"`
	MaskedEmail string `json:"masked_email" gorm:"type:varchar(128);not null;default:''"`
	CreatedAt   int64  `json:"created_at" gorm:"bigint;index"`
}

func (ActivityLotteryRound) TableName() string {
	return "activity_lottery_rounds"
}

func (ActivityLotteryEntry) TableName() string {
	return "activity_lottery_entries"
}

func (ActivityLotteryWinner) TableName() string {
	return "activity_lottery_winners"
}

type ActivityLotteryRoundSummary struct {
	Round            *ActivityLotteryRoundView `json:"round"`
	Winners          []*ActivityLotteryWinner  `json:"winners"`
	NeedParticipants int                       `json:"need_participants"`
	ParticipantCount int64                     `json:"participant_count"`
	TimeReached      bool                      `json:"time_reached"`
	CountReached     bool                      `json:"count_reached"`
	AutoDrawReady    bool                      `json:"auto_draw_ready"`
	Joined           bool                      `json:"joined"`
	JoinAllowed      bool                      `json:"join_allowed"`
	Prize            string                    `json:"prize,omitempty"` // 仅中奖者可见
	IsWinner         bool                      `json:"is_winner"`
}

type ActivityLotteryRoundView struct {
	Id                            int     `json:"id"`
	Title                         string  `json:"title"`
	Prize                         string  `json:"prize"`
	JoinSources                   string  `json:"join_sources"`
	JoinTopupMinMoney             float64 `json:"join_topup_min_money"`
	JoinTopupScope                string  `json:"join_topup_scope"`
	JoinTopupUnit                 string  `json:"join_topup_unit"`
	JoinDailyConsumeMinMoney      float64 `json:"join_daily_consume_min_money"`
	JoinDailyConsumeScope         string  `json:"join_daily_consume_scope"`
	JoinDailyConsumeThresholdUnit string  `json:"join_daily_consume_threshold_unit"`
	Published                     bool    `json:"published"`
	Status                        string  `json:"status"`
	StartAt                       int64   `json:"start_at"`
	EndAt                         int64   `json:"end_at"`
	MinParticipants               int     `json:"min_participants"`
	WinnerCount                   int     `json:"winner_count"`
	ParticipantCount              int64   `json:"participant_count"`
	DrawnAt                       int64   `json:"drawn_at"`
}

func toActivityLotteryRoundView(round *ActivityLotteryRound) *ActivityLotteryRoundView {
	if round == nil {
		return nil
	}
	return &ActivityLotteryRoundView{
		Id:                            round.Id,
		Title:                         round.Title,
		Prize:                         strings.TrimSpace(round.Prize),
		JoinSources:                   normalizeActivityLotteryRoundJoinSources(round.JoinSources),
		JoinTopupMinMoney:             round.JoinTopupMinMoney,
		JoinTopupScope:                normalizeActivityLotteryThresholdScope(round.JoinTopupScope),
		JoinTopupUnit:                 normalizeActivityLotteryThresholdUnit(round.JoinTopupUnit),
		JoinDailyConsumeMinMoney:      round.JoinDailyConsumeMinMoney,
		JoinDailyConsumeScope:         normalizeActivityLotteryThresholdScope(round.JoinDailyConsumeScope),
		JoinDailyConsumeThresholdUnit: normalizeActivityLotteryThresholdUnit(round.JoinDailyConsumeThresholdUnit),
		Published:                     round.Published,
		Status:                        round.Status,
		StartAt:                       round.StartAt,
		EndAt:                         round.EndAt,
		MinParticipants:               round.MinParticipants,
		WinnerCount:                   round.WinnerCount,
		ParticipantCount:              round.ParticipantCount,
		DrawnAt:                       round.DrawnAt,
	}
}

func normalizeLotteryText(value string, maxRunes int) string {
	trimmed := strings.TrimSpace(value)
	if maxRunes <= 0 {
		return trimmed
	}
	runes := []rune(trimmed)
	if len(runes) <= maxRunes {
		return trimmed
	}
	return string(runes[:maxRunes])
}

func maskUsername(username string, userId int) string {
	username = strings.TrimSpace(username)
	if username == "" {
		username = fmt.Sprintf("UID%d", userId)
	}
	r := []rune(username)
	if len(r) <= 1 {
		return "*"
	}
	if len(r) == 2 {
		return string(r[:1]) + "*"
	}
	return string(r[:1]) + strings.Repeat("*", minInt(3, len(r)-2)) + string(r[len(r)-1:])
}

func maskEmail(email string) string {
	email = strings.TrimSpace(email)
	if email == "" {
		return ""
	}
	addr, err := mail.ParseAddress(email)
	if err == nil && addr != nil && addr.Address != "" {
		email = addr.Address
	}
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return "***"
	}
	local := parts[0]
	domain := parts[1]
	if local == "" || domain == "" {
		return "***"
	}
	localRunes := []rune(local)
	maskedLocal := string(localRunes[:1]) + "***"
	domainParts := strings.Split(domain, ".")
	if len(domainParts) < 2 {
		return maskedLocal + "@***"
	}
	host := domainParts[0]
	tld := domainParts[len(domainParts)-1]
	hostRunes := []rune(host)
	maskedHost := "***"
	if len(hostRunes) > 0 {
		maskedHost = string(hostRunes[:1]) + "***"
	}
	return maskedLocal + "@" + maskedHost + "." + tld
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func normalizeActivityLotteryRoundJoinSources(raw string) string {
	normalized := operation_setting.NormalizeActivityLotteryJoinSources(raw)
	if normalized == "" {
		return "manual"
	}
	return normalized
}

func normalizeActivityLotteryThresholdScope(raw string) string {
	value := strings.TrimSpace(strings.ToLower(raw))
	if value != "total" {
		return "today"
	}
	return value
}

func normalizeActivityLotteryThresholdUnit(raw string) string {
	value := strings.TrimSpace(strings.ToLower(raw))
	if value != "token" {
		return "money"
	}
	return value
}

func isActivityLotteryRoundJoinSourceEnabled(round *ActivityLotteryRound, source string) bool {
	if round == nil {
		return false
	}
	source = strings.TrimSpace(strings.ToLower(source))
	if source == "" {
		return false
	}
	for _, part := range strings.Split(normalizeActivityLotteryRoundJoinSources(round.JoinSources), ",") {
		if strings.TrimSpace(part) == source {
			return true
		}
	}
	return false
}

func getActivityLotteryRoundMinParticipants(round *ActivityLotteryRound) int {
	if round != nil && round.MinParticipants > 0 {
		return round.MinParticipants
	}
	return operation_setting.GetActivityLotterySetting().DefaultMinParticipants
}

func getActivityLotteryRoundWinnerCount(round *ActivityLotteryRound) int {
	if round != nil && round.WinnerCount > 0 {
		return round.WinnerCount
	}
	return operation_setting.GetActivityLotterySetting().DefaultWinnerCount
}

func getActivityLotteryRoundJoinTopupMinMoney(round *ActivityLotteryRound) float64 {
	if round != nil && round.JoinTopupMinMoney > 0 {
		return round.JoinTopupMinMoney
	}
	return 0
}

func getActivityLotteryRoundJoinTopupScope(round *ActivityLotteryRound) string {
	if round == nil {
		return "today"
	}
	return normalizeActivityLotteryThresholdScope(round.JoinTopupScope)
}

func getActivityLotteryRoundJoinTopupUnit(round *ActivityLotteryRound) string {
	if round == nil {
		return "money"
	}
	return normalizeActivityLotteryThresholdUnit(round.JoinTopupUnit)
}

func getActivityLotteryRoundJoinDailyConsumeMinMoney(round *ActivityLotteryRound) float64 {
	if round != nil && round.JoinDailyConsumeMinMoney > 0 {
		return round.JoinDailyConsumeMinMoney
	}
	return 0
}

func getActivityLotteryRoundJoinConsumeScope(round *ActivityLotteryRound) string {
	if round == nil {
		return "today"
	}
	return normalizeActivityLotteryThresholdScope(round.JoinDailyConsumeScope)
}

func getActivityLotteryRoundJoinConsumeUnit(round *ActivityLotteryRound) string {
	if round == nil {
		return "money"
	}
	return normalizeActivityLotteryThresholdUnit(round.JoinDailyConsumeThresholdUnit)
}

func getActivityLotteryDayStart(now time.Time) int64 {
	loc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		loc = time.Local
	}
	localNow := now.In(loc)
	return time.Date(localNow.Year(), localNow.Month(), localNow.Day(), 0, 0, 0, 0, loc).Unix()
}

func sumSuccessfulTopupMetric(userId int, scope string, unit string, now time.Time) (float64, error) {
	if userId <= 0 {
		return 0, nil
	}
	query := DB.Model(&TopUp{}).
		Select("money, amount").
		Where("user_id = ? AND status = ?", userId, common.TopUpStatusSuccess)
	if normalizeActivityLotteryThresholdScope(scope) == "today" {
		query = query.Where("complete_time >= ?", getActivityLotteryDayStart(now))
	}
	items := make([]*TopUp, 0)
	if err := query.Find(&items).Error; err != nil {
		return 0, err
	}
	total := 0.0
	useToken := normalizeActivityLotteryThresholdUnit(unit) == "token"
	for _, item := range items {
		if item == nil {
			continue
		}
		value := item.Money
		if value <= 0 && item.Amount > 0 {
			value = float64(item.Amount)
		}
		if value <= 0 {
			continue
		}
		if useToken {
			total += value * common.QuotaPerUnit
			continue
		}
		total += value
	}
	return total, nil
}

func sumConsumeMetric(userId int, scope string, unit string, now time.Time) (float64, error) {
	if userId <= 0 {
		return 0, nil
	}
	query := LOG_DB.Model(&Log{}).
		Select("SUM(quota)").
		Where("type = ? AND user_id = ?", LogTypeConsume, userId)
	if normalizeActivityLotteryThresholdScope(scope) == "today" {
		query = query.Where("created_at >= ?", getActivityLotteryDayStart(now))
	}
	var sum sql.NullInt64
	if err := query.Scan(&sum).Error; err != nil {
		return 0, err
	}
	totalQuota := int64(0)
	if sum.Valid {
		totalQuota = sum.Int64
	}
	if normalizeActivityLotteryThresholdUnit(unit) == "token" {
		return float64(totalQuota), nil
	}
	if common.QuotaPerUnit <= 0 {
		return 0, nil
	}
	return float64(totalQuota) / common.QuotaPerUnit, nil
}

func GetCurrentActivityLotteryRound(now time.Time) (*ActivityLotteryRound, error) {
	if !operation_setting.IsActivityLotteryEnabled() {
		return nil, gorm.ErrRecordNotFound
	}
	nowUnix := now.Unix()
	round := &ActivityLotteryRound{}
	err := DB.Model(&ActivityLotteryRound{}).
		Where("published = ?", true).
		Where("status = ?", ActivityLotteryRoundStatusOpen).
		Where("start_at <= ? AND end_at > ? AND end_at > 0", nowUnix, nowUnix).
		Order("id desc").
		First(round).Error
	return round, err
}

func GetLatestPublishedActivityLotteryRound() (*ActivityLotteryRound, error) {
	round := &ActivityLotteryRound{}
	err := DB.Model(&ActivityLotteryRound{}).
		Where("published = ?", true).
		Order("id desc").
		First(round).Error
	return round, err
}

func EnsureActivityLotteryEntry(userId int, source string, now time.Time) error {
	if !operation_setting.IsActivityLotteryEnabled() {
		return nil
	}
	round, err := GetCurrentActivityLotteryRound(now)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil
		}
		return err
	}
	if round == nil || round.Id <= 0 {
		return nil
	}
	if !isActivityLotteryRoundJoinSourceEnabled(round, source) {
		return fmt.Errorf("当前期数未启用该参与方式")
	}

	nowUnix := now.Unix()
	entry := &ActivityLotteryEntry{
		RoundId:   round.Id,
		UserId:    userId,
		Source:    normalizeLotteryText(source, 32),
		CreatedAt: nowUnix,
	}

	// 跨 DB 幂等插入：依赖唯一索引 (round_id, user_id)
	err = DB.Clauses(clause.OnConflict{DoNothing: true}).Create(entry).Error
	if err != nil {
		return err
	}

	_ = RefreshActivityLotteryRoundParticipantCount(round.Id)
	return nil
}

func RefreshActivityLotteryRoundParticipantCount(roundId int) error {
	if roundId <= 0 {
		return nil
	}
	var cnt int64
	if err := DB.Model(&ActivityLotteryEntry{}).Where("round_id = ?", roundId).Count(&cnt).Error; err != nil {
		return err
	}
	return DB.Model(&ActivityLotteryRound{}).
		Where("id = ?", roundId).
		Update("participant_count", cnt).Error
}

func ListActivityLotteryWinners(roundId int, limit int) ([]*ActivityLotteryWinner, error) {
	if limit <= 0 {
		limit = 50
	}
	items := make([]*ActivityLotteryWinner, 0, limit)
	err := DB.Model(&ActivityLotteryWinner{}).
		Where("round_id = ?", roundId).
		Order("id asc").
		Limit(limit).
		Find(&items).Error
	return items, err
}

func GetActivityLotterySummary(now time.Time, userId int) (*ActivityLotteryRoundSummary, error) {
	round, err := GetCurrentActivityLotteryRound(now)
	if err != nil || round == nil || round.Id <= 0 {
		round, err = GetLatestPublishedActivityLotteryRound()
	}
	if err != nil || round == nil || round.Id <= 0 {
		return &ActivityLotteryRoundSummary{
			Round:            nil,
			Winners:          []*ActivityLotteryWinner{},
			NeedParticipants: 0,
			ParticipantCount: 0,
			TimeReached:      false,
			CountReached:     false,
			AutoDrawReady:    false,
			Joined:           false,
			JoinAllowed:      false,
			Prize:            "",
			IsWinner:         false,
		}, nil
	}
	_ = RefreshActivityLotteryRoundParticipantCount(round.Id)
	if err := DB.First(round, round.Id).Error; err == nil {
		// refreshed
	}
	winners, _ := ListActivityLotteryWinners(round.Id, 50)
	need := round.MinParticipants
	need = getActivityLotteryRoundMinParticipants(round)
	nowUnix := now.Unix()
	timeReached := round.EndAt > 0 && nowUnix >= round.EndAt
	countReached := need > 0 && round.ParticipantCount >= int64(need)
	autoDrawReady := timeReached && countReached
	joined := false
	isWinner := false
	prize := ""
	if userId > 0 && round.Id > 0 {
		var cnt int64
		_ = DB.Model(&ActivityLotteryEntry{}).
			Where("round_id = ? AND user_id = ?", round.Id, userId).
			Count(&cnt).Error
		joined = cnt > 0

		var winCnt int64
		_ = DB.Model(&ActivityLotteryWinner{}).
			Where("round_id = ? AND user_id = ?", round.Id, userId).
			Count(&winCnt).Error
		isWinner = winCnt > 0
		if isWinner {
			prize = strings.TrimSpace(round.PrizeContent)
			if prize == "" {
				prize = strings.TrimSpace(round.Prize)
			}
		}
	}
	joinAllowed := round.Status == ActivityLotteryRoundStatusOpen &&
		round.StartAt > 0 &&
		round.EndAt > 0 &&
		nowUnix >= round.StartAt &&
		nowUnix < round.EndAt &&
		isActivityLotteryRoundJoinSourceEnabled(round, "manual")
	return &ActivityLotteryRoundSummary{
		Round:            toActivityLotteryRoundView(round),
		Winners:          winners,
		NeedParticipants: need,
		ParticipantCount: round.ParticipantCount,
		TimeReached:      timeReached,
		CountReached:     countReached,
		AutoDrawReady:    autoDrawReady,
		Joined:           joined,
		JoinAllowed:      joinAllowed,
		Prize:            prize,
		IsWinner:         isWinner,
	}, nil
}

type ActivityLotteryRoundUpsertRequest struct {
	Title                         string  `json:"title"`
	Prize                         string  `json:"prize"`
	PrizeContent                  string  `json:"prize_content"`
	JoinSources                   string  `json:"join_sources"`
	JoinTopupMinMoney             float64 `json:"join_topup_min_money"`
	JoinTopupScope                string  `json:"join_topup_scope"`
	JoinTopupUnit                 string  `json:"join_topup_unit"`
	JoinDailyConsumeMinMoney      float64 `json:"join_daily_consume_min_money"`
	JoinDailyConsumeScope         string  `json:"join_daily_consume_scope"`
	JoinDailyConsumeThresholdUnit string  `json:"join_daily_consume_threshold_unit"`
	StartAt                       int64   `json:"start_at"`
	EndAt                         int64   `json:"end_at"`
	MinParticipants               int     `json:"min_participants"`
	WinnerCount                   int     `json:"winner_count"`
	Published                     *bool   `json:"published"`
}

func CreateActivityLotteryRound(req *ActivityLotteryRoundUpsertRequest, now time.Time) (*ActivityLotteryRound, error) {
	if req == nil {
		return nil, fmt.Errorf("请求不能为空")
	}
	if strings.TrimSpace(req.Title) == "" {
		return nil, fmt.Errorf("标题不能为空")
	}
	if req.EndAt <= 0 {
		return nil, fmt.Errorf("结束时间不能为空")
	}
	if req.StartAt <= 0 {
		req.StartAt = now.Unix()
	}
	if req.EndAt <= req.StartAt {
		return nil, fmt.Errorf("结束时间必须晚于开始时间")
	}
	minParticipants := req.MinParticipants
	if minParticipants < 0 {
		minParticipants = 0
	}
	winnerCount := req.WinnerCount
	if winnerCount <= 0 {
		winnerCount = operation_setting.GetActivityLotterySetting().DefaultWinnerCount
	}
	joinSources := normalizeActivityLotteryRoundJoinSources(req.JoinSources)
	joinTopupScope := normalizeActivityLotteryThresholdScope(req.JoinTopupScope)
	joinTopupUnit := normalizeActivityLotteryThresholdUnit(req.JoinTopupUnit)
	joinConsumeScope := normalizeActivityLotteryThresholdScope(req.JoinDailyConsumeScope)
	joinConsumeUnit := normalizeActivityLotteryThresholdUnit(req.JoinDailyConsumeThresholdUnit)
	if strings.Contains(joinSources, "topup") && req.JoinTopupMinMoney <= 0 {
		return nil, fmt.Errorf("启用充值参与时，充值门槛必须大于 0")
	}
	if strings.Contains(joinSources, "consume") && req.JoinDailyConsumeMinMoney <= 0 {
		return nil, fmt.Errorf("启用消耗参与时，今日消耗门槛必须大于 0")
	}
	published := false
	if req.Published != nil {
		published = *req.Published
	}

	nowUnix := now.Unix()
	round := &ActivityLotteryRound{
		Title:                         normalizeLotteryText(req.Title, 128),
		Prize:                         strings.TrimSpace(req.Prize),
		PrizeContent:                  strings.TrimSpace(req.PrizeContent),
		JoinSources:                   joinSources,
		JoinTopupMinMoney:             req.JoinTopupMinMoney,
		JoinTopupScope:                joinTopupScope,
		JoinTopupUnit:                 joinTopupUnit,
		JoinDailyConsumeMinMoney:      req.JoinDailyConsumeMinMoney,
		JoinDailyConsumeScope:         joinConsumeScope,
		JoinDailyConsumeThresholdUnit: joinConsumeUnit,
		Published:                     published,
		Status:                        ActivityLotteryRoundStatusDraft,
		StartAt:                       req.StartAt,
		EndAt:                         req.EndAt,
		MinParticipants:               minParticipants,
		WinnerCount:                   winnerCount,
		ParticipantCount:              0,
		DrawnAt:                       0,
		LastError:                     "",
		CreatedAt:                     nowUnix,
		UpdatedAt:                     nowUnix,
	}
	if err := DB.Create(round).Error; err != nil {
		return nil, err
	}
	return round, nil
}

func UpdateActivityLotteryRound(roundId int, req *ActivityLotteryRoundUpsertRequest, now time.Time) (*ActivityLotteryRound, error) {
	if roundId <= 0 {
		return nil, gorm.ErrRecordNotFound
	}
	if req == nil {
		return nil, fmt.Errorf("请求不能为空")
	}
	if strings.TrimSpace(req.Title) == "" {
		return nil, fmt.Errorf("标题不能为空")
	}
	if req.EndAt <= 0 {
		return nil, fmt.Errorf("结束时间不能为空")
	}
	if req.StartAt <= 0 {
		req.StartAt = now.Unix()
	}
	if req.EndAt <= req.StartAt {
		return nil, fmt.Errorf("结束时间必须晚于开始时间")
	}
	minParticipants := req.MinParticipants
	if minParticipants < 0 {
		minParticipants = 0
	}
	winnerCount := req.WinnerCount
	if winnerCount <= 0 {
		winnerCount = operation_setting.GetActivityLotterySetting().DefaultWinnerCount
	}
	joinSources := normalizeActivityLotteryRoundJoinSources(req.JoinSources)
	joinTopupScope := normalizeActivityLotteryThresholdScope(req.JoinTopupScope)
	joinTopupUnit := normalizeActivityLotteryThresholdUnit(req.JoinTopupUnit)
	joinConsumeScope := normalizeActivityLotteryThresholdScope(req.JoinDailyConsumeScope)
	joinConsumeUnit := normalizeActivityLotteryThresholdUnit(req.JoinDailyConsumeThresholdUnit)
	if strings.Contains(joinSources, "topup") && req.JoinTopupMinMoney <= 0 {
		return nil, fmt.Errorf("启用充值参与时，充值门槛必须大于 0")
	}
	if strings.Contains(joinSources, "consume") && req.JoinDailyConsumeMinMoney <= 0 {
		return nil, fmt.Errorf("启用消耗参与时，今日消耗门槛必须大于 0")
	}

	round := &ActivityLotteryRound{}
	if err := DB.First(round, roundId).Error; err != nil {
		return nil, err
	}
	if round.Status == ActivityLotteryRoundStatusDrawn || round.Status == ActivityLotteryRoundStatusClosed || round.Status == ActivityLotteryRoundStatusExpired {
		return nil, fmt.Errorf("已开奖/已结束的期数不允许修改")
	}

	update := map[string]any{
		"title":                             normalizeLotteryText(req.Title, 128),
		"prize":                             strings.TrimSpace(req.Prize),
		"prize_content":                     strings.TrimSpace(req.PrizeContent),
		"join_sources":                      joinSources,
		"join_topup_min_money":              req.JoinTopupMinMoney,
		"join_topup_scope":                  joinTopupScope,
		"join_topup_unit":                   joinTopupUnit,
		"join_daily_consume_min_money":      req.JoinDailyConsumeMinMoney,
		"join_daily_consume_scope":          joinConsumeScope,
		"join_daily_consume_threshold_unit": joinConsumeUnit,
		"start_at":                          req.StartAt,
		"end_at":                            req.EndAt,
		"min_participants":                  minParticipants,
		"winner_count":                      winnerCount,
		"updated_at":                        now.Unix(),
	}
	if req.Published != nil {
		update["published"] = *req.Published
	}
	if err := DB.Model(&ActivityLotteryRound{}).Where("id = ?", roundId).Updates(update).Error; err != nil {
		return nil, err
	}
	if err := DB.First(round, roundId).Error; err != nil {
		return nil, err
	}
	return round, nil
}

func OpenActivityLotteryRound(roundId int, now time.Time) error {
	if roundId <= 0 {
		return gorm.ErrRecordNotFound
	}
	nowUnix := now.Unix()
	return DB.Transaction(func(tx *gorm.DB) error {
		// 关闭其他进行中的期数，避免并行多个 open 造成歧义
		if err := tx.Model(&ActivityLotteryRound{}).
			Where("status = ?", ActivityLotteryRoundStatusOpen).
			Where("id <> ?", roundId).
			Updates(map[string]any{
				"status":     ActivityLotteryRoundStatusClosed,
				"updated_at": nowUnix,
			}).Error; err != nil {
			return err
		}
		return tx.Model(&ActivityLotteryRound{}).
			Where("id = ?", roundId).
			Updates(map[string]any{
				"status":     ActivityLotteryRoundStatusOpen,
				"published":  true,
				"updated_at": nowUnix,
			}).Error
	})
}

func CloseActivityLotteryRound(roundId int, now time.Time) error {
	if roundId <= 0 {
		return gorm.ErrRecordNotFound
	}
	return DB.Model(&ActivityLotteryRound{}).
		Where("id = ?", roundId).
		Updates(map[string]any{
			"status":     ActivityLotteryRoundStatusClosed,
			"updated_at": now.Unix(),
		}).Error
}

func ListActivityLotteryRounds(page int, pageSize int) ([]*ActivityLotteryRound, int64, error) {
	page, pageSize = normalizeCheckinPage(page, pageSize)
	query := DB.Model(&ActivityLotteryRound{})
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	items := make([]*ActivityLotteryRound, 0, pageSize)
	if total > 0 {
		if err := query.Order("id desc").
			Limit(pageSize).
			Offset((page - 1) * pageSize).
			Find(&items).Error; err != nil {
			return nil, 0, err
		}
	}
	return items, total, nil
}

type PublicActivityLotteryRound struct {
	Round   *ActivityLotteryRoundView `json:"round"`
	Winners []*ActivityLotteryWinner  `json:"winners"`
}

func ListPublicActivityLotteryRounds(limit int) ([]*PublicActivityLotteryRound, error) {
	if limit <= 0 {
		limit = 20
	}
	rounds := make([]*ActivityLotteryRound, 0, limit)
	if err := DB.Model(&ActivityLotteryRound{}).
		Where("published = ?", true).
		Order("id desc").
		Limit(limit).
		Find(&rounds).Error; err != nil {
		return nil, err
	}
	result := make([]*PublicActivityLotteryRound, 0, len(rounds))
	for _, round := range rounds {
		if round == nil || round.Id <= 0 {
			continue
		}
		winners, _ := ListActivityLotteryWinners(round.Id, 50)
		result = append(result, &PublicActivityLotteryRound{
			Round:   toActivityLotteryRoundView(round),
			Winners: winners,
		})
	}
	return result, nil
}

func pickRandomUserIDs(ids []int, count int) []int {
	if count <= 0 || len(ids) == 0 {
		return []int{}
	}
	if count >= len(ids) {
		return ids
	}
	// Fisher-Yates shuffle using crypto/rand
	out := make([]int, len(ids))
	copy(out, ids)
	for i := len(out) - 1; i > 0; i-- {
		nBig, err := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
		if err != nil {
			// fallback to time-based
			j := int(time.Now().UnixNano() % int64(i+1))
			out[i], out[j] = out[j], out[i]
			continue
		}
		j := int(nBig.Int64())
		out[i], out[j] = out[j], out[i]
	}
	return out[:count]
}

func DrawActivityLotteryRound(roundId int, now time.Time) ([]*ActivityLotteryWinner, error) {
	if roundId <= 0 {
		return nil, gorm.ErrRecordNotFound
	}

	nowUnix := now.Unix()
	var winners []*ActivityLotteryWinner
	err := DB.Transaction(func(tx *gorm.DB) error {
		round := &ActivityLotteryRound{}
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(round, roundId).Error; err != nil {
			return err
		}
		if round.Status == ActivityLotteryRoundStatusDrawn {
			// idempotent
			existing := make([]*ActivityLotteryWinner, 0)
			_ = tx.Where("round_id = ?", roundId).Order("id asc").Find(&existing).Error
			winners = existing
			return nil
		}
		if round.Status != ActivityLotteryRoundStatusOpen && round.Status != ActivityLotteryRoundStatusDraft {
			return fmt.Errorf("当前期数状态不允许开奖")
		}

		var userIDs []int
		entries := make([]*ActivityLotteryEntry, 0)
		if err := tx.Where("round_id = ?", roundId).Find(&entries).Error; err != nil {
			return err
		}
		userIDs = make([]int, 0, len(entries))
		seen := make(map[int]struct{}, len(entries))
		for _, e := range entries {
			if e == nil || e.UserId <= 0 {
				continue
			}
			if _, ok := seen[e.UserId]; ok {
				continue
			}
			seen[e.UserId] = struct{}{}
			userIDs = append(userIDs, e.UserId)
		}

		need := getActivityLotteryRoundMinParticipants(round)
		if need > 0 && int64(len(userIDs)) < int64(need) {
			return fmt.Errorf("参与人数不足：%d/%d", len(userIDs), need)
		}
		if round.EndAt > 0 && nowUnix < round.EndAt {
			return fmt.Errorf("未到结束时间")
		}

		winnerCount := getActivityLotteryRoundWinnerCount(round)
		selected := pickRandomUserIDs(userIDs, winnerCount)
		if len(selected) == 0 {
			return fmt.Errorf("无可开奖用户")
		}

		// load user display info
		users := make([]*User, 0)
		if err := tx.Model(&User{}).Where("id IN ?", selected).Find(&users).Error; err != nil {
			return err
		}
		userMap := make(map[int]*User, len(users))
		for _, u := range users {
			if u != nil {
				userMap[u.Id] = u
			}
		}

		nowUnix = now.Unix()
		winners = make([]*ActivityLotteryWinner, 0, len(selected))
		for _, userID := range selected {
			u := userMap[userID]
			maskedName := maskUsername("", userID)
			maskedEmail := ""
			if u != nil {
				maskedName = maskUsername(u.Username, u.Id)
				maskedEmail = maskEmail(u.Email)
			}
			winners = append(winners, &ActivityLotteryWinner{
				RoundId:     roundId,
				UserId:      userID,
				MaskedName:  maskedName,
				MaskedEmail: maskedEmail,
				CreatedAt:   nowUnix,
			})
		}
		if err := tx.Create(&winners).Error; err != nil {
			return err
		}

		// 站内信通知：奖品内容仅发给中奖者（放在同一事务内避免重复发送）
		for _, w := range winners {
			if w == nil || w.UserId <= 0 {
				continue
			}
			startAtText := "-"
			endAtText := "-"
			if round.StartAt > 0 {
				startAtText = time.Unix(round.StartAt, 0).Format("2006-01-02 15:04:05")
			}
			if round.EndAt > 0 {
				endAtText = time.Unix(round.EndAt, 0).Format("2006-01-02 15:04:05")
			}
			content := fmt.Sprintf(
				"恭喜中奖！\n\n活动：%s\n奖品：%s\n活动时间：%s ~ %s\n\n请妥善保管奖品信息。",
				round.Title,
				func() string {
					value := strings.TrimSpace(round.PrizeContent)
					if value == "" {
						return strings.TrimSpace(round.Prize)
					}
					return value
				}(),
				startAtText,
				endAtText,
			)
			notification := &SiteNotification{
				UserId:       w.UserId,
				SenderUserId: 0,
				Title:        "活动抽奖中奖通知",
				Content:      content,
				Level:        "success",
			}
			if err := CreateSiteNotificationTx(tx, notification); err != nil {
				return err
			}
		}

		if err := tx.Model(&ActivityLotteryRound{}).Where("id = ?", roundId).Updates(map[string]any{
			"status":     ActivityLotteryRoundStatusDrawn,
			"drawn_at":   nowUnix,
			"last_error": "",
			"updated_at": nowUnix,
		}).Error; err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		_ = DB.Model(&ActivityLotteryRound{}).Where("id = ?", roundId).Updates(map[string]any{
			"last_error": err.Error(),
			"updated_at": now.Unix(),
		}).Error
		return nil, err
	}
	return winners, nil
}

func ExpireActivityLotteryRound(roundId int, now time.Time) error {
	if roundId <= 0 {
		return gorm.ErrRecordNotFound
	}
	nowUnix := now.Unix()
	return DB.Model(&ActivityLotteryRound{}).
		Where("id = ? AND status = ?", roundId, ActivityLotteryRoundStatusOpen).
		Updates(map[string]any{
			"status":     ActivityLotteryRoundStatusExpired,
			"last_error": "",
			"updated_at": nowUnix,
		}).Error
}

func ListDueActivityLotteryRoundsToFinalize(now time.Time, limit int) ([]*ActivityLotteryRound, error) {
	if limit <= 0 {
		limit = 10
	}
	nowUnix := now.Unix()
	items := make([]*ActivityLotteryRound, 0, limit)
	err := DB.Model(&ActivityLotteryRound{}).
		Where("published = ?", true).
		Where("status = ?", ActivityLotteryRoundStatusOpen).
		Where("end_at > 0 AND end_at <= ?", nowUnix).
		Order("end_at asc, id asc").
		Limit(limit).
		Find(&items).Error
	return items, err
}

func tryJoinActivityLotteryByTopup(topUp *TopUp, now time.Time) {
	if topUp == nil || topUp.UserId <= 0 {
		return
	}
	setting := operation_setting.GetActivityLotterySetting()
	if setting == nil || !setting.Enabled {
		return
	}
	round, err := GetCurrentActivityLotteryRound(now)
	if err != nil || round == nil || round.Id <= 0 {
		return
	}
	if !isActivityLotteryRoundJoinSourceEnabled(round, "topup") {
		return
	}
	threshold := getActivityLotteryRoundJoinTopupMinMoney(round)
	if threshold <= 0 {
		return
	}
	progress, err := sumSuccessfulTopupMetric(
		topUp.UserId,
		getActivityLotteryRoundJoinTopupScope(round),
		getActivityLotteryRoundJoinTopupUnit(round),
		now,
	)
	if err != nil || progress < threshold {
		return
	}
	_ = EnsureActivityLotteryEntry(topUp.UserId, "topup", now)
}

func tryJoinActivityLotteryByDailyConsume(userId int, consumeQuota int, now time.Time) {
	if userId <= 0 || consumeQuota <= 0 {
		return
	}
	setting := operation_setting.GetActivityLotterySetting()
	if setting == nil || !setting.Enabled {
		return
	}
	round, err := GetCurrentActivityLotteryRound(now)
	if err != nil || round == nil || round.Id <= 0 {
		return
	}
	if !isActivityLotteryRoundJoinSourceEnabled(round, "consume") {
		return
	}
	threshold := getActivityLotteryRoundJoinDailyConsumeMinMoney(round)
	if threshold <= 0 {
		return
	}
	progress, err := sumConsumeMetric(
		userId,
		getActivityLotteryRoundJoinConsumeScope(round),
		getActivityLotteryRoundJoinConsumeUnit(round),
		now,
	)
	if err == nil && progress >= threshold {
		_ = EnsureActivityLotteryEntry(userId, "consume", now)
	}
}

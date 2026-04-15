package model

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/bytedance/gopkg/util/gopool"
	"gorm.io/gorm"
)

type Token struct {
	Id                      int            `json:"id"`
	UserId                  int            `json:"user_id" gorm:"index"`
	UserSubscriptionId      int            `json:"user_subscription_id" gorm:"type:int;not null;default:0;index"`
	Username                string         `json:"username,omitempty" gorm:"column:username;->;-:migration"`
	Key                     string         `json:"key" gorm:"type:char(48);uniqueIndex"`
	Source                  string         `json:"source" gorm:"type:varchar(64);not null;default:'';index"`
	SpecificChannelId       int            `json:"specific_channel_id" gorm:"type:int;not null;default:0"`
	SpecificChannelKeyIndex int            `json:"specific_channel_key_index" gorm:"type:int;not null;default:-1"`
	Status                  int            `json:"status" gorm:"default:1"`
	Name                    string         `json:"name" gorm:"index" `
	CreatedTime             int64          `json:"created_time" gorm:"bigint"`
	AccessedTime            int64          `json:"accessed_time" gorm:"bigint"`
	ExpiredTime             int64          `json:"expired_time" gorm:"bigint;default:-1"` // -1 means never expired
	RemainQuota             int            `json:"remain_quota" gorm:"default:0"`
	UnlimitedQuota          bool           `json:"unlimited_quota"`
	ModelLimitsEnabled      bool           `json:"model_limits_enabled"`
	ModelLimits             string         `json:"model_limits" gorm:"type:text"`
	AllowIps                *string        `json:"allow_ips" gorm:"default:''"`
	UsedQuota               int            `json:"used_quota" gorm:"default:0"` // used quota
	Group                   string         `json:"group" gorm:"default:''"`
	CrossGroupRetry         bool           `json:"cross_group_retry"` // 跨分组重试，仅auto分组有效
	DeletedAt               gorm.DeletedAt `gorm:"index"`
}

const SubscriptionAggregateAccessTokenName = "Subscription Access"

const (
	TokenSourceUserCreated                 = "user_created"
	TokenSourceSubscriptionAggregateAccess = "subscription_aggregate_access"
	TokenSourceSubscriptionSpecificChannel = "subscription_specific_channel"
	TokenSourceDerivedDayPassAccess        = "subscription_derived_day_pass_access"
)

func normalizeTokenSource(source string) string {
	switch strings.TrimSpace(source) {
	case TokenSourceSubscriptionAggregateAccess:
		return TokenSourceSubscriptionAggregateAccess
	case TokenSourceSubscriptionSpecificChannel:
		return TokenSourceSubscriptionSpecificChannel
	case TokenSourceDerivedDayPassAccess:
		return TokenSourceDerivedDayPassAccess
	case TokenSourceUserCreated:
		return TokenSourceUserCreated
	default:
		return ""
	}
}

func (token *Token) legacySubscriptionAggregateAccessToken() bool {
	if token == nil {
		return false
	}
	return token.SpecificChannelId <= 0 && strings.TrimSpace(token.Name) == SubscriptionAggregateAccessTokenName
}

func (token *Token) legacySubscriptionSpecificChannelToken() bool {
	if token == nil {
		return false
	}
	if token.SpecificChannelId <= 0 {
		return false
	}
	return strings.HasPrefix(strings.TrimSpace(token.Group), "sub_plan_")
}

func (token *Token) GetEffectiveSource() string {
	if token == nil {
		return TokenSourceUserCreated
	}
	if source := normalizeTokenSource(token.Source); source != "" {
		return source
	}
	if token.legacySubscriptionAggregateAccessToken() {
		return TokenSourceSubscriptionAggregateAccess
	}
	if token.legacySubscriptionSpecificChannelToken() {
		return TokenSourceSubscriptionSpecificChannel
	}
	return TokenSourceUserCreated
}

func (token *Token) IsActiveSubscriptionAggregateAccessToken(now int64) bool {
	if token == nil {
		return false
	}
	if !token.IsSubscriptionAggregateAccessToken() {
		return false
	}
	return token.ExpiredTime == -1 || token.ExpiredTime > now
}

func (token *Token) IsSubscriptionSpecificChannelToken() bool {
	if token == nil {
		return false
	}
	if token.GetEffectiveSource() == TokenSourceSubscriptionSpecificChannel {
		return true
	}
	return token.legacySubscriptionSpecificChannelToken()
}

func (token *Token) IsDerivedDayPassAccessToken() bool {
	if token == nil {
		return false
	}
	return token.GetEffectiveSource() == TokenSourceDerivedDayPassAccess &&
		token.UserSubscriptionId > 0
}

func (token *Token) IsSubscriptionAggregateAccessToken() bool {
	if token == nil {
		return false
	}
	if token.GetEffectiveSource() != TokenSourceSubscriptionAggregateAccess {
		return false
	}
	return token.SpecificChannelId <= 0
}

type AdminTokenSearchFilters struct {
	Username     string
	TokenName    string
	Token        string
	Status       string
	Group        string
	ExpiredState string
	StartTime    int64
	EndTime      int64
}

type UserTokenSearchFilters struct {
	Keyword        string
	Token          string
	Status         string
	Group          string
	ExpiredState   string
	UnlimitedState string
}

func (token *Token) Clean() {
	token.Key = ""
}

func MaskTokenKey(key string) string {
	if key == "" {
		return ""
	}
	if len(key) <= 4 {
		return strings.Repeat("*", len(key))
	}
	if len(key) <= 8 {
		return key[:2] + "****" + key[len(key)-2:]
	}
	return key[:4] + "**********" + key[len(key)-4:]
}

func (token *Token) GetFullKey() string {
	return token.Key
}

func (token *Token) GetMaskedKey() string {
	return MaskTokenKey(token.Key)
}

func (token *Token) GetIpLimits() []string {
	// delete empty spaces
	//split with \n
	ipLimits := make([]string, 0)
	if token.AllowIps == nil {
		return ipLimits
	}
	cleanIps := strings.ReplaceAll(*token.AllowIps, " ", "")
	if cleanIps == "" {
		return ipLimits
	}
	ips := strings.Split(cleanIps, "\n")
	for _, ip := range ips {
		ip = strings.TrimSpace(ip)
		ip = strings.ReplaceAll(ip, ",", "")
		if ip != "" {
			ipLimits = append(ipLimits, ip)
		}
	}
	return ipLimits
}

func GetAllUserTokens(userId int, startIdx int, num int) ([]*Token, error) {
	var tokens []*Token
	var err error
	err = DB.Where("user_id = ?", userId).Order("id desc").Limit(num).Offset(startIdx).Find(&tokens).Error
	return tokens, err
}

type activeSpecificChannelKeyBindingCount struct {
	SpecificChannelKeyIndex int   `gorm:"column:specific_channel_key_index"`
	BindingCount            int64 `gorm:"column:binding_count"`
}

type ActiveSpecificChannelKeyBindingDetail struct {
	KeyIndex      int                                   `json:"key_index"`
	BindingCount  int64                                 `json:"binding_count"`
	BindingGroups []string                              `json:"binding_groups,omitempty"`
	BindingUsers  []ActiveSpecificChannelKeyBindingUser `json:"binding_users,omitempty"`
}

type activeSpecificChannelKeyBindingDetailRow struct {
	SpecificChannelKeyIndex int    `gorm:"column:specific_channel_key_index"`
	Group                   string `gorm:"column:group_name"`
	BindingCount            int64  `gorm:"column:binding_count"`
}

type ActiveSpecificChannelKeyBindingUser struct {
	UserId      int    `json:"user_id"`
	Username    string `json:"username"`
	TokenId     int    `json:"token_id"`
	TokenName   string `json:"token_name"`
	TokenGroup  string `json:"token_group"`
	ExpiredTime int64  `json:"expired_time"`
	Status      int    `json:"status"`
}

type activeSpecificChannelKeyBindingUserRow struct {
	SpecificChannelKeyIndex int    `gorm:"column:specific_channel_key_index"`
	UserId                  int    `gorm:"column:user_id"`
	Username                string `gorm:"column:username"`
	TokenId                 int    `gorm:"column:token_id"`
	TokenName               string `gorm:"column:token_name"`
	TokenGroup              string `gorm:"column:token_group"`
	ExpiredTime             int64  `gorm:"column:expired_time"`
	Status                  int    `gorm:"column:status"`
}

type activeSpecificChannelKeyBindingSubscriptionDetailRow struct {
	SpecificChannelKeyIndex int    `gorm:"column:specific_channel_key_index"`
	Group                   string `gorm:"column:group_name"`
	BindingCount            int64  `gorm:"column:binding_count"`
}

type activeSpecificChannelKeyBindingSubscriptionUserRow struct {
	SpecificChannelKeyIndex int    `gorm:"column:specific_channel_key_index"`
	UserId                  int    `gorm:"column:user_id"`
	Username                string `gorm:"column:username"`
	UserSubscriptionId      int    `gorm:"column:user_subscription_id"`
	PlanId                  int    `gorm:"column:plan_id"`
	SubscriptionGroup       string `gorm:"column:subscription_group"`
	ExpiredTime             int64  `gorm:"column:expired_time"`
	Status                  string `gorm:"column:status"`
}

func GetActiveSpecificChannelKeyBindingCountMap(channelId int) (map[int]int64, error) {
	var rows []activeSpecificChannelKeyBindingCount
	err := DB.Model(&Token{}).
		Select("specific_channel_key_index, COUNT(*) AS binding_count").
		Where(
			"specific_channel_id = ? AND specific_channel_key_index >= 0 AND deleted_at IS NULL",
			channelId,
		).
		Group("specific_channel_key_index").
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	result := make(map[int]int64, len(rows))
	for _, row := range rows {
		result[row.SpecificChannelKeyIndex] = row.BindingCount
	}
	return result, nil
}

func GetActiveSpecificChannelKeyBindingDetailMap(channelId int) (map[int]ActiveSpecificChannelKeyBindingDetail, error) {
	var rows []activeSpecificChannelKeyBindingDetailRow
	groupCol := commonGroupCol
	if groupCol == "" {
		if common.UsingPostgreSQL {
			groupCol = `"group"`
		} else {
			groupCol = "`group`"
		}
	}
	err := DB.Model(&Token{}).
		Select("specific_channel_key_index, "+groupCol+" as group_name, COUNT(*) AS binding_count").
		Where(
			"specific_channel_id = ? AND specific_channel_key_index >= 0 AND deleted_at IS NULL",
			channelId,
		).
		Group("specific_channel_key_index, " + groupCol).
		Find(&rows).Error
	if err != nil {
		return nil, err
	}
	result := make(map[int]ActiveSpecificChannelKeyBindingDetail)
	for _, row := range rows {
		item := result[row.SpecificChannelKeyIndex]
		item.KeyIndex = row.SpecificChannelKeyIndex
		item.BindingCount += row.BindingCount
		groupName := strings.TrimSpace(row.Group)
		if groupName != "" {
			exists := false
			for _, current := range item.BindingGroups {
				if current == groupName {
					exists = true
					break
				}
			}
			if !exists {
				item.BindingGroups = append(item.BindingGroups, groupName)
			}
		}
		result[row.SpecificChannelKeyIndex] = item
	}
	now := common.GetTimestamp()
	var subRows []activeSpecificChannelKeyBindingSubscriptionDetailRow
	err = DB.Model(&UserSubscription{}).
		Select("specific_channel_key_index, upgrade_group as group_name, COUNT(*) AS binding_count").
		Where(
			"specific_channel_id = ? AND specific_channel_key_index >= 0 AND status = ? AND end_time > ?",
			channelId,
			"active",
			now,
		).
		Group("specific_channel_key_index, upgrade_group").
		Find(&subRows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range subRows {
		item := result[row.SpecificChannelKeyIndex]
		item.KeyIndex = row.SpecificChannelKeyIndex
		item.BindingCount += row.BindingCount
		groupName := strings.TrimSpace(row.Group)
		if groupName != "" {
			exists := false
			for _, current := range item.BindingGroups {
				if current == groupName {
					exists = true
					break
				}
			}
			if !exists {
				item.BindingGroups = append(item.BindingGroups, groupName)
			}
		}
		result[row.SpecificChannelKeyIndex] = item
	}
	qualifiedGroupCol := qualifiedTokenGroupCol()
	var userRows []activeSpecificChannelKeyBindingUserRow
	err = DB.Model(&Token{}).
		Select("tokens.specific_channel_key_index, tokens.user_id, users.username, tokens.id as token_id, tokens.name as token_name, "+qualifiedGroupCol+" as token_group, tokens.expired_time, tokens.status").
		Joins("LEFT JOIN users ON users.id = tokens.user_id").
		Where(
			"tokens.specific_channel_id = ? AND tokens.specific_channel_key_index >= 0 AND tokens.deleted_at IS NULL",
			channelId,
		).
		Order("tokens.specific_channel_key_index asc, tokens.id asc").
		Find(&userRows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range userRows {
		item := result[row.SpecificChannelKeyIndex]
		item.KeyIndex = row.SpecificChannelKeyIndex
		item.BindingUsers = append(item.BindingUsers, ActiveSpecificChannelKeyBindingUser{
			UserId:      row.UserId,
			Username:    row.Username,
			TokenId:     row.TokenId,
			TokenName:   row.TokenName,
			TokenGroup:  row.TokenGroup,
			ExpiredTime: row.ExpiredTime,
			Status:      row.Status,
		})
		result[row.SpecificChannelKeyIndex] = item
	}
	var subUserRows []activeSpecificChannelKeyBindingSubscriptionUserRow
	err = DB.Model(&UserSubscription{}).
		Select("user_subscriptions.specific_channel_key_index, user_subscriptions.user_id, users.username, user_subscriptions.id as user_subscription_id, user_subscriptions.plan_id, user_subscriptions.upgrade_group as subscription_group, user_subscriptions.end_time as expired_time, user_subscriptions.status").
		Joins("LEFT JOIN users ON users.id = user_subscriptions.user_id").
		Where(
			"user_subscriptions.specific_channel_id = ? AND user_subscriptions.specific_channel_key_index >= 0 AND user_subscriptions.status = ? AND user_subscriptions.end_time > ?",
			channelId,
			"active",
			now,
		).
		Order("user_subscriptions.specific_channel_key_index asc, user_subscriptions.id asc").
		Find(&subUserRows).Error
	if err != nil {
		return nil, err
	}
	for _, row := range subUserRows {
		item := result[row.SpecificChannelKeyIndex]
		item.KeyIndex = row.SpecificChannelKeyIndex
		item.BindingUsers = append(item.BindingUsers, ActiveSpecificChannelKeyBindingUser{
			UserId:      row.UserId,
			Username:    row.Username,
			TokenId:     -row.UserSubscriptionId,
			TokenName:   fmt.Sprintf("订阅 #%d · Plan %d", row.UserSubscriptionId, row.PlanId),
			TokenGroup:  row.SubscriptionGroup,
			ExpiredTime: row.ExpiredTime,
			Status:      1,
		})
		result[row.SpecificChannelKeyIndex] = item
	}
	return result, nil
}

func qualifiedTokenGroupCol() string {
	if commonGroupCol != "" {
		return "tokens." + commonGroupCol
	}
	if common.UsingPostgreSQL {
		return `tokens."group"`
	}
	return "tokens.`group`"
}

func NormalizeLegacySpecificChannelKeyBindings(channelId int, defaultKeyIndex int) (int64, error) {
	if channelId <= 0 {
		return 0, errors.New("invalid channelId")
	}
	if defaultKeyIndex < 0 {
		defaultKeyIndex = 0
	}
	updates := map[string]any{
		"specific_channel_key_index": defaultKeyIndex,
	}
	result := DB.Model(&Token{}).
		Where("specific_channel_id = ? AND specific_channel_key_index < 0 AND deleted_at IS NULL", channelId).
		Updates(updates)
	if result.Error != nil {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}

func qualifiedTokenKeyCol() string {
	if commonKeyCol != "" {
		return "tokens." + commonKeyCol
	}
	if common.UsingPostgreSQL {
		return `tokens."key"`
	}
	return "tokens.`key`"
}

func GetAllTokensByAdmin(startIdx int, num int) ([]*Token, int64, error) {
	var tokens []*Token
	var total int64

	baseQuery := DB.Model(&Token{}).
		Select("tokens.*, users.username").
		Joins("LEFT JOIN users ON users.id = tokens.user_id")

	if err := baseQuery.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	if err := baseQuery.
		Order("tokens.id desc").
		Limit(num).
		Offset(startIdx).
		Find(&tokens).Error; err != nil {
		return nil, 0, err
	}

	return tokens, total, nil
}

func buildAdminTokenSearchQuery(filters AdminTokenSearchFilters) (*gorm.DB, error) {
	baseQuery := DB.Model(&Token{}).
		Select("tokens.*, users.username").
		Joins("LEFT JOIN users ON users.id = tokens.user_id")

	if filters.Username != "" {
		usernamePattern, err := sanitizeLikePattern(strings.TrimSpace(filters.Username))
		if err != nil {
			return nil, err
		}
		usernameQuery := baseQuery.Where("users.username LIKE ? ESCAPE '!'", usernamePattern)
		if keywordInt, convErr := strconv.Atoi(strings.TrimSpace(filters.Username)); convErr == nil {
			usernameQuery = usernameQuery.Or("tokens.user_id = ?", keywordInt)
		}
		baseQuery = usernameQuery
	}

	if filters.TokenName != "" {
		tokenNamePattern, err := sanitizeLikePattern(strings.TrimSpace(filters.TokenName))
		if err != nil {
			return nil, err
		}
		baseQuery = baseQuery.Where("tokens.name LIKE ? ESCAPE '!'", tokenNamePattern)
	}

	if filters.Token != "" {
		tokenPattern, err := sanitizeLikePattern(strings.TrimPrefix(strings.TrimSpace(filters.Token), "sk-"))
		if err != nil {
			return nil, err
		}
		baseQuery = baseQuery.Where(qualifiedTokenKeyCol()+" LIKE ? ESCAPE '!'", tokenPattern)
	}

	if filters.Status != "" {
		status, err := strconv.Atoi(filters.Status)
		if err != nil {
			return nil, errors.New("状态参数无效")
		}
		baseQuery = baseQuery.Where("tokens.status = ?", status)
	}

	if filters.Group != "" {
		baseQuery = baseQuery.Where(qualifiedTokenGroupCol()+" = ?", filters.Group)
	}

	now := common.GetTimestamp()
	switch strings.TrimSpace(filters.ExpiredState) {
	case "expired":
		baseQuery = baseQuery.Where("tokens.expired_time <> ? AND tokens.expired_time < ?", -1, now)
	case "not_expired":
		baseQuery = baseQuery.Where("(tokens.expired_time = ? OR tokens.expired_time >= ?)", -1, now)
	}

	if filters.StartTime > 0 {
		baseQuery = baseQuery.Where("tokens.created_time >= ?", filters.StartTime)
	}
	if filters.EndTime > 0 {
		baseQuery = baseQuery.Where("tokens.created_time <= ?", filters.EndTime)
	}

	return baseQuery, nil
}

func buildUserTokenSearchQuery(userId int, filters UserTokenSearchFilters) (*gorm.DB, error) {
	keyword := strings.TrimSpace(filters.Keyword)
	token := strings.TrimPrefix(strings.TrimSpace(filters.Token), "sk-")

	if token != "" {
		token = strings.TrimPrefix(token, "sk-")
	}

	maxTokens := operation_setting.GetMaxUserTokens()
	hasFuzzy := strings.Contains(keyword, "%") || strings.Contains(token, "%")
	if hasFuzzy {
		count, err := CountUserTokens(userId)
		if err != nil {
			common.SysLog("failed to count user tokens: " + err.Error())
			return nil, errors.New("获取令牌数量失败")
		}
		if int(count) > maxTokens {
			return nil, errors.New("令牌数量超过上限，仅允许精确搜索，请勿使用 % 通配符")
		}
	}

	baseQuery := DB.Model(&Token{}).Where("user_id = ?", userId)
	if keyword != "" {
		keywordPattern, err := sanitizeLikePattern(keyword)
		if err != nil {
			return nil, err
		}
		baseQuery = baseQuery.Where("name LIKE ? ESCAPE '!'", keywordPattern)
	}
	if token != "" {
		tokenPattern, err := sanitizeLikePattern(token)
		if err != nil {
			return nil, err
		}
		baseQuery = baseQuery.Where(qualifiedTokenKeyCol()+" LIKE ? ESCAPE '!'", tokenPattern)
	}

	if filters.Status != "" {
		status, err := strconv.Atoi(strings.TrimSpace(filters.Status))
		if err != nil {
			return nil, errors.New("状态参数无效")
		}
		baseQuery = baseQuery.Where("status = ?", status)
	}

	if group := strings.TrimSpace(filters.Group); group != "" {
		baseQuery = baseQuery.Where(qualifiedTokenGroupCol()+" = ?", group)
	}

	now := common.GetTimestamp()
	switch strings.TrimSpace(filters.ExpiredState) {
	case "expired":
		baseQuery = baseQuery.Where("expired_time <> ? AND expired_time < ?", -1, now)
	case "not_expired":
		baseQuery = baseQuery.Where("(expired_time = ? OR expired_time >= ?)", -1, now)
	}

	switch strings.TrimSpace(filters.UnlimitedState) {
	case "unlimited":
		baseQuery = baseQuery.Where("unlimited_quota = ?", true)
	case "limited":
		baseQuery = baseQuery.Where("unlimited_quota = ?", false)
	}

	return baseQuery, nil
}

func applyInvalidTokenFilter(query *gorm.DB, now int64) *gorm.DB {
	if query == nil {
		return nil
	}
	return query.Where(
		"status <> ? OR (expired_time <> ? AND expired_time < ?) OR (unlimited_quota = ? AND remain_quota <= ?)",
		common.TokenStatusEnabled,
		-1,
		now,
		false,
		0,
	)
}

// sanitizeLikePattern 校验并清洗用户输入的 LIKE 搜索模式。
// 规则：
//  1. 转义 ! 和 _（使用 ! 作为 ESCAPE 字符，兼容 MySQL/PostgreSQL/SQLite）
//  2. 连续的 % 合并为单个 %
//  3. 最多允许 2 个 %
//  4. 含 % 时（模糊搜索），去掉 % 后关键词长度必须 >= 2
//  5. 不含 % 时按精确匹配
func sanitizeLikePattern(input string) (string, error) {
	// 1. 先转义 ESCAPE 字符 ! 自身，再转义 _
	//    使用 ! 而非 \ 作为 ESCAPE 字符，避免 MySQL 中反斜杠的字符串转义问题
	input = strings.ReplaceAll(input, "!", "!!")
	input = strings.ReplaceAll(input, `_`, `!_`)

	// 2. 连续的 % 直接拒绝
	if strings.Contains(input, "%%") {
		return "", errors.New("搜索模式中不允许包含连续的 % 通配符")
	}

	// 3. 统计 % 数量，不得超过 2
	count := strings.Count(input, "%")
	if count > 2 {
		return "", errors.New("搜索模式中最多允许包含 2 个 % 通配符")
	}

	// 4. 含 % 时，去掉 % 后关键词长度必须 >= 2
	if count > 0 {
		stripped := strings.ReplaceAll(input, "%", "")
		if len(stripped) < 2 {
			return "", errors.New("使用模糊搜索时，关键词长度至少为 2 个字符")
		}
		return input, nil
	}

	// 5. 无 % 时，精确全匹配
	return input, nil
}

const searchHardLimit = 100

func SearchUserTokens(userId int, filters UserTokenSearchFilters, offset int, limit int) (tokens []*Token, total int64, err error) {
	// model 层强制截断
	if limit <= 0 || limit > searchHardLimit {
		limit = searchHardLimit
	}
	if offset < 0 {
		offset = 0
	}

	baseQuery, err := buildUserTokenSearchQuery(userId, filters)
	if err != nil {
		return nil, 0, err
	}

	// 先查匹配总数（用于分页，受 maxTokens 上限保护，避免全表 COUNT）
	maxTokens := operation_setting.GetMaxUserTokens()
	err = baseQuery.Limit(maxTokens).Count(&total).Error
	if err != nil {
		common.SysError("failed to count search tokens: " + err.Error())
		return nil, 0, errors.New("搜索令牌失败")
	}

	// 再分页查数据
	err = baseQuery.Order("id desc").Offset(offset).Limit(limit).Find(&tokens).Error
	if err != nil {
		common.SysError("failed to search tokens: " + err.Error())
		return nil, 0, errors.New("搜索令牌失败")
	}
	return tokens, total, nil
}

func SearchTokensByAdmin(filters AdminTokenSearchFilters, offset int, limit int) (tokens []*Token, total int64, err error) {
	if limit <= 0 || limit > searchHardLimit {
		limit = searchHardLimit
	}
	if offset < 0 {
		offset = 0
	}

	baseQuery, err := buildAdminTokenSearchQuery(filters)
	if err != nil {
		return nil, 0, err
	}

	if err = baseQuery.Count(&total).Error; err != nil {
		common.SysError("failed to count admin search tokens: " + err.Error())
		return nil, 0, errors.New("搜索令牌失败")
	}

	if err = baseQuery.Order("tokens.id desc").Offset(offset).Limit(limit).Find(&tokens).Error; err != nil {
		common.SysError("failed to search admin tokens: " + err.Error())
		return nil, 0, errors.New("搜索令牌失败")
	}

	return tokens, total, nil
}

func BatchDeleteInvalidTokensByFilter(userId int, filters UserTokenSearchFilters) (int, error) {
	baseQuery, err := buildUserTokenSearchQuery(userId, filters)
	if err != nil {
		return 0, err
	}
	now := common.GetTimestamp()
	baseQuery = applyInvalidTokenFilter(baseQuery, now)

	tx := DB.Begin()
	if tx.Error != nil {
		return 0, tx.Error
	}

	var tokens []Token
	if err := baseQuery.Session(&gorm.Session{}).Find(&tokens).Error; err != nil {
		tx.Rollback()
		return 0, err
	}
	if len(tokens) == 0 {
		tx.Rollback()
		return 0, nil
	}

	ids := make([]int, 0, len(tokens))
	for _, token := range tokens {
		if token.IsActiveSubscriptionAggregateAccessToken(now) {
			continue
		}
		ids = append(ids, token.Id)
	}
	if len(ids) == 0 {
		tx.Rollback()
		return 0, nil
	}
	if err := tx.Where("user_id = ? AND id IN (?)", userId, ids).Delete(&Token{}).Error; err != nil {
		tx.Rollback()
		return 0, err
	}
	if err := tx.Commit().Error; err != nil {
		return 0, err
	}

	if common.RedisEnabled {
		gopool.Go(func() {
			for _, token := range tokens {
				if token.IsActiveSubscriptionAggregateAccessToken(now) {
					continue
				}
				_ = cacheDeleteToken(token.Key)
			}
		})
	}
	return len(ids), nil
}

func ValidateUserToken(key string) (token *Token, err error) {
	if key == "" {
		return nil, errors.New("https://fishxcode.com/ 提示 未提供令牌")
	}
	token, err = GetTokenByKey(key, false)
	if err == nil {
		if token.Status == common.TokenStatusExhausted {
			keyPrefix := key[:3]
			keySuffix := key[len(key)-3:]
			return token, errors.New("https://fishxcode.com/ 提示 该令牌额度已用尽 TokenStatusExhausted[sk-" + keyPrefix + "***" + keySuffix + "]")
		} else if token.Status == common.TokenStatusExpired {
			return token, errors.New("https://fishxcode.com/ 提示 该令牌已过期")
		}
		if token.Status != common.TokenStatusEnabled {
			return token, errors.New("https://fishxcode.com/ 提示 该令牌状态不可用")
		}
		if token.ExpiredTime != -1 && token.ExpiredTime < common.GetTimestamp() {
			if !common.RedisEnabled {
				token.Status = common.TokenStatusExpired
				err := token.SelectUpdate()
				if err != nil {
					common.SysLog("https://fishxcode.com/ 提示 failed to update token status" + err.Error())
				}
			}
			return token, errors.New("https://fishxcode.com/ 提示 该令牌已过期")
		}
		if !token.UnlimitedQuota && token.RemainQuota <= 0 {
			if !common.RedisEnabled {
				// in this case, we can make sure the token is exhausted
				token.Status = common.TokenStatusExhausted
				err := token.SelectUpdate()
				if err != nil {
					common.SysLog("failed to update token status" + err.Error())
				}
			}
			keyPrefix := key[:3]
			keySuffix := key[len(key)-3:]
			return token, fmt.Errorf("[sk-%s***%s] https://fishxcode.com/ 提示 该令牌额度已用尽 !token.UnlimitedQuota && token.RemainQuota = %d", keyPrefix, keySuffix, token.RemainQuota)
		}
		return token, nil
	}
	common.SysLog("ValidateUserToken: failed to get token: " + err.Error())
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, errors.New("https://fishxcode.com/ 提示 无效的令牌")
	} else {
		return nil, errors.New("https://fishxcode.com/ 提示 无效的令牌，数据库查询出错，请联系管理员")
	}
}

func GetTokenByIds(id int, userId int) (*Token, error) {
	if id == 0 || userId == 0 {
		return nil, errors.New("id 或 userId 为空！")
	}
	token := Token{Id: id, UserId: userId}
	var err error = nil
	err = DB.First(&token, "id = ? and user_id = ?", id, userId).Error
	return &token, err
}

func GetTokenById(id int) (*Token, error) {
	if id == 0 {
		return nil, errors.New("id 为空！")
	}
	token := Token{Id: id}
	var err error = nil
	err = DB.First(&token, "id = ?", id).Error
	if shouldUpdateRedis(true, err) {
		gopool.Go(func() {
			if err := cacheSetToken(token); err != nil {
				common.SysLog("failed to update user status cache: " + err.Error())
			}
		})
	}
	return &token, err
}

func GetTokenByKey(key string, fromDB bool) (token *Token, err error) {
	defer func() {
		// Update Redis cache asynchronously on successful DB read
		if shouldUpdateRedis(fromDB, err) && token != nil {
			gopool.Go(func() {
				if err := cacheSetToken(*token); err != nil {
					common.SysLog("failed to update user status cache: " + err.Error())
				}
			})
		}
	}()
	if !fromDB && common.RedisEnabled {
		// Try Redis first
		token, err := cacheGetTokenByKey(key)
		if err == nil {
			return token, nil
		}
		// Don't return error - fall through to DB
	}
	fromDB = true
	keyCol := commonKeyCol
	if strings.TrimSpace(keyCol) == "" {
		keyCol = "`key`"
		if common.UsingPostgreSQL {
			keyCol = `"key"`
		}
	}
	err = DB.Where(keyCol+" = ?", key).First(&token).Error
	return token, err
}

func (token *Token) Insert() error {
	var err error
	err = DB.Create(token).Error
	return err
}

// Update Make sure your token's fields is completed, because this will update non-zero values
func (token *Token) Update() (err error) {
	defer func() {
		if shouldUpdateRedis(true, err) {
			gopool.Go(func() {
				err := cacheSetToken(*token)
				if err != nil {
					common.SysLog("failed to update token cache: " + err.Error())
				}
			})
		}
	}()
	err = DB.Model(token).Select("name", "status", "expired_time", "remain_quota", "unlimited_quota",
		"model_limits_enabled", "model_limits", "allow_ips", "group", "cross_group_retry", "specific_channel_id", "specific_channel_key_index", "user_subscription_id", "source").Updates(token).Error
	return err
}

func isTokenKeyDuplicateError(err error) bool {
	if err == nil {
		return false
	}
	message := strings.ToLower(err.Error())
	return strings.Contains(message, "duplicate") ||
		strings.Contains(message, "unique constraint") ||
		strings.Contains(message, "unique failed")
}

func (token *Token) RotateKey() (string, error) {
	if token == nil || token.Id <= 0 {
		return "", errors.New("invalid token")
	}
	oldKey := strings.TrimSpace(token.Key)
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		newKey, err := common.GenerateKey()
		if err != nil {
			lastErr = err
			continue
		}
		if newKey == "" || newKey == oldKey {
			lastErr = errors.New("generated empty or duplicated token key")
			continue
		}
		err = DB.Model(&Token{}).
			Where("id = ?", token.Id).
			Update("key", newKey).Error
		if err != nil {
			lastErr = err
			if isTokenKeyDuplicateError(err) {
				continue
			}
			return "", err
		}
		token.Key = newKey
		if common.RedisEnabled {
			tokenCopy := *token
			gopool.Go(func() {
				if oldKey != "" {
					_ = cacheDeleteToken(oldKey)
				}
				_ = cacheSetToken(tokenCopy)
			})
		}
		return newKey, nil
	}
	if lastErr == nil {
		lastErr = errors.New("failed to rotate token key")
	}
	return "", lastErr
}

func (token *Token) SelectUpdate() (err error) {
	defer func() {
		if shouldUpdateRedis(true, err) {
			gopool.Go(func() {
				err := cacheSetToken(*token)
				if err != nil {
					common.SysLog("failed to update token cache: " + err.Error())
				}
			})
		}
	}()
	// This can update zero values
	return DB.Model(token).Select("accessed_time", "status").Updates(token).Error
}

func (token *Token) Delete() (err error) {
	defer func() {
		if shouldUpdateRedis(true, err) {
			gopool.Go(func() {
				err := cacheDeleteToken(token.Key)
				if err != nil {
					common.SysLog("failed to delete token cache: " + err.Error())
				}
			})
		}
	}()
	err = DB.Delete(token).Error
	return err
}

func (token *Token) IsModelLimitsEnabled() bool {
	return token.ModelLimitsEnabled
}

func (token *Token) GetModelLimits() []string {
	if token.ModelLimits == "" {
		return []string{}
	}
	return strings.Split(token.ModelLimits, ",")
}

func (token *Token) GetModelLimitsMap() map[string]bool {
	limits := token.GetModelLimits()
	limitsMap := make(map[string]bool)
	for _, limit := range limits {
		limitsMap[limit] = true
	}
	return limitsMap
}

func DisableModelLimits(tokenId int) error {
	token, err := GetTokenById(tokenId)
	if err != nil {
		return err
	}
	token.ModelLimitsEnabled = false
	token.ModelLimits = ""
	return token.Update()
}

func DeleteTokenById(id int, userId int) (err error) {
	// Why we need userId here? In case user want to delete other's token.
	if id == 0 || userId == 0 {
		return errors.New("id 或 userId 为空！")
	}
	token := Token{Id: id, UserId: userId}
	err = DB.Where(token).First(&token).Error
	if err != nil {
		return err
	}
	if token.IsActiveSubscriptionAggregateAccessToken(common.GetTimestamp()) {
		return errors.New("有效期内的 Subscription Access 令牌不可删除")
	}
	return token.Delete()
}

func IncreaseTokenQuota(tokenId int, key string, quota int) (err error) {
	if quota < 0 {
		return errors.New("quota 不能为负数！")
	}
	if common.RedisEnabled {
		gopool.Go(func() {
			err := cacheIncrTokenQuota(key, int64(quota))
			if err != nil {
				common.SysLog("failed to increase token quota: " + err.Error())
			}
		})
	}
	if common.BatchUpdateEnabled {
		addNewRecord(BatchUpdateTypeTokenQuota, tokenId, quota)
		return nil
	}
	return increaseTokenQuota(tokenId, quota)
}

func increaseTokenQuota(id int, quota int) (err error) {
	err = DB.Model(&Token{}).Where("id = ?", id).Updates(
		map[string]interface{}{
			"remain_quota":  gorm.Expr("remain_quota + ?", quota),
			"used_quota":    gorm.Expr("used_quota - ?", quota),
			"accessed_time": common.GetTimestamp(),
		},
	).Error
	return err
}

func DecreaseTokenQuota(id int, key string, quota int) (err error) {
	if quota < 0 {
		return errors.New("quota 不能为负数！")
	}
	if common.RedisEnabled {
		gopool.Go(func() {
			err := cacheDecrTokenQuota(key, int64(quota))
			if err != nil {
				common.SysLog("failed to decrease token quota: " + err.Error())
			}
		})
	}
	if common.BatchUpdateEnabled {
		addNewRecord(BatchUpdateTypeTokenQuota, id, -quota)
		return nil
	}
	return decreaseTokenQuota(id, quota)
}

func decreaseTokenQuota(id int, quota int) (err error) {
	err = DB.Model(&Token{}).Where("id = ?", id).Updates(
		map[string]interface{}{
			"remain_quota":  gorm.Expr("remain_quota - ?", quota),
			"used_quota":    gorm.Expr("used_quota + ?", quota),
			"accessed_time": common.GetTimestamp(),
		},
	).Error
	return err
}

// CountUserTokens returns total number of tokens for the given user, used for pagination
func CountUserTokens(userId int) (int64, error) {
	var total int64
	err := DB.Model(&Token{}).Where("user_id = ?", userId).Count(&total).Error
	return total, err
}

// BatchDeleteTokens 删除指定用户的一组令牌，返回成功删除数量
func BatchDeleteTokens(ids []int, userId int) (int, error) {
	if len(ids) == 0 {
		return 0, errors.New("ids 不能为空！")
	}

	tx := DB.Begin()
	now := common.GetTimestamp()

	var tokens []Token
	if err := tx.Where("user_id = ? AND id IN (?)", userId, ids).Find(&tokens).Error; err != nil {
		tx.Rollback()
		return 0, err
	}

	deletableIDs := make([]int, 0, len(tokens))
	for _, token := range tokens {
		if token.IsActiveSubscriptionAggregateAccessToken(now) {
			continue
		}
		deletableIDs = append(deletableIDs, token.Id)
	}
	if len(deletableIDs) == 0 {
		tx.Rollback()
		return 0, nil
	}

	if err := tx.Where("user_id = ? AND id IN (?)", userId, deletableIDs).Delete(&Token{}).Error; err != nil {
		tx.Rollback()
		return 0, err
	}

	if err := tx.Commit().Error; err != nil {
		return 0, err
	}

	if common.RedisEnabled {
		gopool.Go(func() {
			for _, t := range tokens {
				if t.IsActiveSubscriptionAggregateAccessToken(now) {
					continue
				}
				_ = cacheDeleteToken(t.Key)
			}
		})
	}

	return len(deletableIDs), nil
}

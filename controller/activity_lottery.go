package controller

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

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

func GetActivityLotteryCurrent(c *gin.Context) {
	now := model.GetCheckinNow()
	userId := c.GetInt("id") // TryUserAuth may set it, otherwise 0
	summary, err := model.GetActivityLotterySummary(now, userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, summary)
}

func GetActivityLotteryPublicRounds(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	items, err := model.ListPublicActivityLotteryRounds(limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"items": items})
}

func JoinActivityLotteryCurrent(c *gin.Context) {
	userId := c.GetInt("id")
	if userId <= 0 {
		common.ApiErrorMsg(c, "未登录")
		return
	}
	now := model.GetCheckinNow()
	if err := model.EnsureActivityLotteryEntry(userId, "manual", now); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"joined": true})
}

func AdminListActivityLotteryRounds(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	pageSize, _ := strconv.Atoi(c.DefaultQuery("page_size", strconv.Itoa(common.ItemsPerPage)))
	items, total, err := model.ListActivityLotteryRounds(page, pageSize)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{
		"items":     items,
		"total":     total,
		"page":      page,
		"page_size": pageSize,
	})
}

func AdminCreateActivityLotteryRound(c *gin.Context) {
	req := ActivityLotteryRoundUpsertRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	now := model.GetCheckinNow()
	round, err := model.CreateActivityLotteryRound(&model.ActivityLotteryRoundUpsertRequest{
		Title:                         strings.TrimSpace(req.Title),
		Prize:                         strings.TrimSpace(req.Prize),
		PrizeContent:                  strings.TrimSpace(req.PrizeContent),
		JoinSources:                   req.JoinSources,
		JoinTopupMinMoney:             req.JoinTopupMinMoney,
		JoinTopupScope:                req.JoinTopupScope,
		JoinTopupUnit:                 req.JoinTopupUnit,
		JoinDailyConsumeMinMoney:      req.JoinDailyConsumeMinMoney,
		JoinDailyConsumeScope:         req.JoinDailyConsumeScope,
		JoinDailyConsumeThresholdUnit: req.JoinDailyConsumeThresholdUnit,
		StartAt:                       req.StartAt,
		EndAt:                         req.EndAt,
		MinParticipants:               req.MinParticipants,
		WinnerCount:                   req.WinnerCount,
		Published:                     req.Published,
	}, now)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, round)
}

func AdminUpdateActivityLotteryRound(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "无效的期数ID")
		return
	}
	req := ActivityLotteryRoundUpsertRequest{}
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiError(c, err)
		return
	}
	now := model.GetCheckinNow()
	round, err := model.UpdateActivityLotteryRound(id, &model.ActivityLotteryRoundUpsertRequest{
		Title:                         strings.TrimSpace(req.Title),
		Prize:                         strings.TrimSpace(req.Prize),
		PrizeContent:                  strings.TrimSpace(req.PrizeContent),
		JoinSources:                   req.JoinSources,
		JoinTopupMinMoney:             req.JoinTopupMinMoney,
		JoinTopupScope:                req.JoinTopupScope,
		JoinTopupUnit:                 req.JoinTopupUnit,
		JoinDailyConsumeMinMoney:      req.JoinDailyConsumeMinMoney,
		JoinDailyConsumeScope:         req.JoinDailyConsumeScope,
		JoinDailyConsumeThresholdUnit: req.JoinDailyConsumeThresholdUnit,
		StartAt:                       req.StartAt,
		EndAt:                         req.EndAt,
		MinParticipants:               req.MinParticipants,
		WinnerCount:                   req.WinnerCount,
		Published:                     req.Published,
	}, now)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, round)
}

func AdminOpenActivityLotteryRound(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "无效的期数ID")
		return
	}
	now := model.GetCheckinNow()
	if err := model.OpenActivityLotteryRound(id, now); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": gin.H{"id": id, "status": model.ActivityLotteryRoundStatusOpen}})
}

func AdminDrawActivityLotteryRound(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "无效的期数ID")
		return
	}
	now := model.GetCheckinNow()
	winners, err := model.DrawActivityLotteryRound(id, now)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, gin.H{"id": id, "winners": winners})
}

package controller

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type SupportTicketCreateRequest struct {
	Type     string `json:"type"`
	Subject  string `json:"subject"`
	Content  string `json:"content"`
	ImageURL string `json:"image_url"`
}

type SupportTicketMessageRequest struct {
	Content       string `json:"content"`
	ImageURL      string `json:"image_url"`
	EmailLanguage string `json:"email_language"`
}

type SupportTicketUpdateRequest struct {
	Status   string `json:"status"`
	Priority string `json:"priority"`
}

type SupportTicketDetailResponse struct {
	Ticket           *model.SupportTicket                 `json:"ticket"`
	Messages         []*model.SupportTicketMessage        `json:"messages"`
	TrialApplication *model.SupportTicketTrialApplication `json:"trial_application,omitempty"`
}

type SupportTicketReplyResponse struct {
	Ticket  *model.SupportTicket        `json:"ticket"`
	Message *model.SupportTicketMessage `json:"message"`
}

type SupportTicketTrialApplicationReviewRequest struct {
	Approved bool `json:"approved"`
}

type SupportTicketTrialApplicationResponse struct {
	TrialApplication *model.SupportTicketTrialApplication `json:"trial_application"`
	Ticket           *model.SupportTicket                 `json:"ticket"`
	Message          *model.SupportTicketMessage          `json:"message"`
}

func isSupportTicketAdmin(c *gin.Context) bool {
	return c.GetInt("role") >= common.RoleAdminUser
}

func parseSupportTicketId(c *gin.Context) (int, bool) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil || id <= 0 {
		common.ApiErrorMsg(c, "无效的工单ID")
		return 0, false
	}
	return id, true
}

func loadSupportTicketForRequest(c *gin.Context, ticketId int) (*model.SupportTicket, bool) {
	ticket, err := model.GetSupportTicketById(ticketId)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			common.ApiErrorMsg(c, "工单不存在")
		} else {
			common.ApiError(c, err)
		}
		return nil, false
	}
	if !isSupportTicketAdmin(c) && ticket.UserId != c.GetInt("id") {
		common.ApiErrorMsg(c, "无权查看此工单")
		return nil, false
	}
	return ticket, true
}

func ListSupportTickets(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	items, total, err := model.ListSupportTickets(c.GetInt("id"), isSupportTicketAdmin(c), pageInfo, model.SupportTicketFilters{
		Status:   c.Query("status"),
		Type:     c.Query("type"),
		Priority: c.Query("priority"),
		Keyword:  c.Query("keyword"),
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(items)
	common.ApiSuccess(c, pageInfo)
}

func CreateSupportTicket(c *gin.Context) {
	var req SupportTicketCreateRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "无效的请求参数")
		return
	}
	ticket, err := model.CreateSupportTicketWithImage(c.GetInt("id"), req.Type, req.Subject, req.Content, req.ImageURL)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	service.NotifySupportTicketCreatedAsync(ticket)
	common.ApiSuccess(c, ticket)
}

func GetSupportTicketDetail(c *gin.Context) {
	ticketId, ok := parseSupportTicketId(c)
	if !ok {
		return
	}
	ticket, ok := loadSupportTicketForRequest(c, ticketId)
	if !ok {
		return
	}
	messages, err := model.GetSupportTicketMessages(ticket.Id)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	trialApplication, err := model.GetSupportTicketTrialApplicationByTicketId(ticket.Id)
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, SupportTicketDetailResponse{
		Ticket:           ticket,
		Messages:         messages,
		TrialApplication: trialApplication,
	})
}

func AddSupportTicketMessage(c *gin.Context) {
	ticketId, ok := parseSupportTicketId(c)
	if !ok {
		return
	}
	ticket, ok := loadSupportTicketForRequest(c, ticketId)
	if !ok {
		return
	}
	previousStatus := ticket.Status

	var req SupportTicketMessageRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "无效的请求参数")
		return
	}
	message, updated, err := model.AddSupportTicketMessageWithImage(ticket.Id, c.GetInt("id"), isSupportTicketAdmin(c), req.Content, req.ImageURL)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	if previousStatus != updated.Status && !message.IsAdmin {
		service.NotifySupportTicketStatusUpdatedAsync(updated, c.GetInt("id"), previousStatus)
	}
	service.NotifySupportTicketMessageAddedAsync(c.GetInt("id"), updated, message, req.EmailLanguage)
	common.ApiSuccess(c, SupportTicketReplyResponse{
		Ticket:  updated,
		Message: message,
	})
}

func CreateSupportTicketTrialApplication(c *gin.Context) {
	ticketId, ok := parseSupportTicketId(c)
	if !ok {
		return
	}
	ticket, ok := loadSupportTicketForRequest(c, ticketId)
	if !ok {
		return
	}
	if isSupportTicketAdmin(c) || ticket.UserId != c.GetInt("id") {
		common.ApiErrorMsg(c, "只能为自己的工单提交试用额度申请")
		return
	}
	application, message, updated, err := model.CreateSupportTicketTrialApplication(ticket.Id, c.GetInt("id"), c.ClientIP())
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	service.NotifySupportTicketMessageAddedAsync(c.GetInt("id"), updated, message, service.SupportTicketEmailLanguageEn)
	common.ApiSuccess(c, SupportTicketTrialApplicationResponse{
		TrialApplication: application,
		Ticket:           updated,
		Message:          message,
	})
}

func ReviewSupportTicketTrialApplication(c *gin.Context) {
	if !isSupportTicketAdmin(c) {
		common.ApiErrorMsg(c, "无权审核试用额度申请")
		return
	}
	ticketId, ok := parseSupportTicketId(c)
	if !ok {
		return
	}
	ticket, ok := loadSupportTicketForRequest(c, ticketId)
	if !ok {
		return
	}
	var req SupportTicketTrialApplicationReviewRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "无效的请求参数")
		return
	}
	application, message, updated, err := model.ReviewSupportTicketTrialApplication(ticket.Id, c.GetInt("id"), req.Approved)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	service.NotifySupportTicketMessageAddedAsync(c.GetInt("id"), updated, message, service.SupportTicketEmailLanguageEn)
	common.ApiSuccess(c, SupportTicketTrialApplicationResponse{
		TrialApplication: application,
		Ticket:           updated,
		Message:          message,
	})
}

func UploadSupportTicketAttachment(c *gin.Context) {
	file, err := c.FormFile("file")
	if err != nil {
		common.ApiErrorMsg(c, "获取上传文件失败："+err.Error())
		return
	}

	url, err := service.UploadSupportTicketImage(file)
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}

	common.ApiSuccess(c, gin.H{"url": url})
}

func UpdateSupportTicket(c *gin.Context) {
	ticketId, ok := parseSupportTicketId(c)
	if !ok {
		return
	}
	ticket, ok := loadSupportTicketForRequest(c, ticketId)
	if !ok {
		return
	}
	previousStatus := ticket.Status

	var req SupportTicketUpdateRequest
	if err := common.DecodeJson(c.Request.Body, &req); err != nil {
		common.ApiErrorMsg(c, "无效的请求参数")
		return
	}

	var updated *model.SupportTicket
	var err error
	if isSupportTicketAdmin(c) {
		updated, err = model.UpdateSupportTicketByAdmin(ticket.Id, req.Status, req.Priority)
	} else {
		if strings.TrimSpace(req.Priority) != "" || strings.TrimSpace(req.Status) != model.SupportTicketStatusClosed {
			common.ApiErrorMsg(c, "无权更新此工单")
			return
		}
		updated, err = model.CloseSupportTicketByUser(ticket.Id, c.GetInt("id"))
	}
	if err != nil {
		common.ApiErrorMsg(c, err.Error())
		return
	}
	if previousStatus != updated.Status {
		service.NotifySupportTicketStatusUpdatedAsync(updated, c.GetInt("id"), previousStatus)
	}
	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data":    updated,
	})
}

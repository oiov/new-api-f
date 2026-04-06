package controller

import (
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"github.com/gin-gonic/gin"
)

// ─────────────────────────────────────────────────────────────────
// 用户端接口
// ─────────────────────────────────────────────────────────────────

// GetInvoiceableTopUps 获取用户可开票的充值记录
func GetInvoiceableTopUps(c *gin.Context) {
	userId := c.GetInt("id")
	topups, err := model.GetInvoiceableTopUps(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, topups)
}

// GetUserInvoices 获取用户自己的发票列表
func GetUserInvoices(c *gin.Context) {
	userId := c.GetInt("id")
	pageInfo := common.GetPageQuery(c)

	invoices, total, err := model.GetUserInvoices(userId, pageInfo)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(invoices)
	common.ApiSuccess(c, pageInfo)
}

type InvoiceRequest struct {
	TopUpIds []int  `json:"topup_ids" binding:"required,min=1"`
	Title    string `json:"title" binding:"required"`
	TaxId    string `json:"tax_id"`
	Email    string `json:"email" binding:"required,email"`
}

// CreateInvoice 用户提交开票申请
func CreateInvoice(c *gin.Context) {
	userId := c.GetInt("id")
	var req InvoiceRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误："+err.Error())
		return
	}

	// 查询关联充值记录，计算金额
	var totalMoney float64
	topups, err := model.GetInvoiceableTopUps(userId)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	idSet := make(map[int]bool, len(req.TopUpIds))
	for _, id := range req.TopUpIds {
		idSet[id] = true
	}

	for _, t := range topups {
		if idSet[t.Id] {
			totalMoney += t.Money
		}
	}

	if totalMoney < model.MinInvoiceAmount {
		common.ApiErrorMsg(c, fmt.Sprintf("开票金额不足 %.0f 元（当前：%.2f 元）", model.MinInvoiceAmount, totalMoney))
		return
	}

	// 构建 topup_ids 字符串
	ids := make([]string, len(req.TopUpIds))
	for i, id := range req.TopUpIds {
		ids[i] = strconv.Itoa(id)
	}

	inv := &model.Invoice{
		UserId:   userId,
		Title:    strings.TrimSpace(req.Title),
		TaxId:    strings.TrimSpace(req.TaxId),
		Email:    strings.TrimSpace(req.Email),
		Amount:   totalMoney,
		TopUpIds: strings.Join(ids, ","),
		Status:   model.InvoiceStatusPending,
	}

	if err := inv.Insert(req.TopUpIds); err != nil {
		common.ApiError(c, err)
		return
	}
	common.ApiSuccess(c, inv)
}

// ─────────────────────────────────────────────────────────────────
// 管理员端接口
// ─────────────────────────────────────────────────────────────────

// GetAllInvoices 管理员获取所有发票申请
func GetAllInvoices(c *gin.Context) {
	pageInfo := common.GetPageQuery(c)
	userId, _ := strconv.Atoi(c.Query("user_id"))
	status := c.Query("status")
	keyword := c.Query("keyword")

	invoices, total, err := model.GetAllInvoices(pageInfo, model.InvoiceAdminFilters{
		UserId:  userId,
		Status:  status,
		Keyword: keyword,
	})
	if err != nil {
		common.ApiError(c, err)
		return
	}
	pageInfo.SetTotal(int(total))
	pageInfo.SetItems(invoices)
	common.ApiSuccess(c, pageInfo)
}

type AdminIssueRequest struct {
	FileUrl string `json:"file_url" binding:"required"`
	Remark  string `json:"remark"`
}

// IssueInvoice 管理员开具发票（上传文件URL）
func IssueInvoice(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "无效的发票ID")
		return
	}

	var req AdminIssueRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "参数错误："+err.Error())
		return
	}

	inv, err := model.GetInvoiceById(id)
	if err != nil {
		common.ApiErrorMsg(c, "发票不存在")
		return
	}
	if inv.Status != model.InvoiceStatusPending {
		common.ApiErrorMsg(c, "只能开具待处理的发票申请")
		return
	}

	inv.Status = model.InvoiceStatusIssued
	inv.FileUrl = strings.TrimSpace(req.FileUrl)
	inv.Remark = req.Remark

	if err := inv.Update(); err != nil {
		common.ApiError(c, err)
		return
	}

	// 异步发送邮件通知
	go sendInvoiceIssuedEmail(inv)

	common.ApiSuccess(c, inv)
}

type AdminRejectRequest struct {
	Remark string `json:"remark" binding:"required"`
}

// RejectInvoice 管理员拒绝发票申请
func RejectInvoice(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "无效的发票ID")
		return
	}

	var req AdminRejectRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		common.ApiErrorMsg(c, "请提供拒绝原因")
		return
	}

	inv, err := model.GetInvoiceById(id)
	if err != nil {
		common.ApiErrorMsg(c, "发票不存在")
		return
	}

	if err := inv.Reject(req.Remark); err != nil {
		common.ApiError(c, err)
		return
	}

	// 异步发送拒绝通知邮件
	go sendInvoiceRejectedEmail(inv)

	common.ApiSuccess(c, gin.H{"message": "已拒绝"})
}

type AdminSendEmailRequest struct {
	Email string `json:"email"` // 可覆盖原始邮箱
}

// SendInvoiceEmail 管理员手动发送发票邮件
func SendInvoiceEmail(c *gin.Context) {
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		common.ApiErrorMsg(c, "无效的发票ID")
		return
	}

	inv, err := model.GetInvoiceById(id)
	if err != nil {
		common.ApiErrorMsg(c, "发票不存在")
		return
	}
	if inv.Status != model.InvoiceStatusIssued && inv.Status != model.InvoiceStatusSent {
		common.ApiErrorMsg(c, "发票尚未开具，无法发送")
		return
	}
	if inv.FileUrl == "" {
		common.ApiErrorMsg(c, "发票文件尚未上传")
		return
	}

	var req AdminSendEmailRequest
	if err := c.ShouldBindJSON(&req); err == nil && req.Email != "" {
		inv.Email = req.Email
	}

	if err := sendInvoiceIssuedEmail(inv); err != nil {
		common.ApiErrorMsg(c, "发送邮件失败："+err.Error())
		return
	}

	// 更新状态
	inv.Status = model.InvoiceStatusSent
	_ = inv.Update()

	common.ApiSuccess(c, gin.H{"message": "邮件已发送至 " + inv.Email})
}

// ─────────────────────────────────────────────────────────────────
// 内部辅助函数
// ─────────────────────────────────────────────────────────────────

func sendInvoiceIssuedEmail(inv *model.Invoice) error {
	siteName := common.SystemName
	siteUrl := system_setting.ServerAddress

	subject := fmt.Sprintf("【%s】您的发票已开具", siteName)
	content := fmt.Sprintf(`<p>尊敬的用户，您好！</p>
<p>您在 <strong>%s</strong> 申请的发票已开具完成。</p>
<table style="border-collapse:collapse;margin:16px 0;">
  <tr><td style="padding:4px 12px 4px 0;color:#666;">发票抬头</td><td><strong>%s</strong></td></tr>
  <tr><td style="padding:4px 12px 4px 0;color:#666;">发票金额</td><td><strong>¥%.2f</strong></td></tr>
</table>
<p>请点击以下链接下载发票：</p>
<p><a href="%s" style="color:#1677ff;">%s</a></p>
<p style="color:#999;font-size:12px;">如有疑问，请联系我们的客服。</p>
<p style="color:#999;font-size:12px;">此邮件由 %s 自动发送，请勿回复。</p>`,
		siteName, inv.Title, inv.Amount, inv.FileUrl, inv.FileUrl, siteUrl)

	return common.SendEmail(subject, inv.Email, content)
}

func sendInvoiceRejectedEmail(inv *model.Invoice) error {
	siteName := common.SystemName

	subject := fmt.Sprintf("【%s】您的发票申请已被拒绝", siteName)
	content := fmt.Sprintf(`<p>尊敬的用户，您好！</p>
<p>很遗憾，您的发票申请（金额：¥%.2f，抬头：%s）未能通过审核。</p>
<p>拒绝原因：<strong>%s</strong></p>
<p>您对应的充值记录已恢复为可开票状态，欢迎重新提交申请。</p>
<p style="color:#999;font-size:12px;">此邮件由 %s 自动发送，请勿回复。</p>`,
		inv.Amount, inv.Title, inv.Remark, siteName)

	return common.SendEmail(subject, inv.Email, content)
}

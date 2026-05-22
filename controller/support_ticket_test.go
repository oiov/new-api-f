package controller

import (
	"bytes"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupSupportTicketControllerTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	oldDB := model.DB
	oldLogDB := model.LOG_DB
	oldUsingSQLite := common.UsingSQLite

	gin.SetMode(gin.TestMode)
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.SupportTicket{}, &model.SupportTicketMessage{}, &model.SiteNotification{}))

	model.DB = db
	model.LOG_DB = db
	common.UsingSQLite = true

	t.Cleanup(func() {
		model.DB = oldDB
		model.LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
	})

	return db
}

func TestSupportTicketCreateAndDetailForOwner(t *testing.T) {
	db := setupSupportTicketControllerTestDB(t)
	user := seedUser(t, db, 7, "alice", common.RoleCommonUser)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPost, "/api/support/tickets", map[string]any{
		"type":    model.SupportTicketTypeRefund,
		"subject": "申请退款",
		"content": "订单号 abc",
	}, user.Id)
	ctx.Set("role", user.Role)

	CreateSupportTicket(ctx)

	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	var ticket model.SupportTicket
	require.NoError(t, common.Unmarshal(response.Data, &ticket))
	require.Equal(t, model.SupportTicketPriorityHigh, ticket.Priority)

	ctx, recorder = newAuthenticatedContext(t, http.MethodGet, "/api/support/tickets/1", nil, user.Id)
	ctx.Params = append(ctx.Params, ginParam("id", strconv.Itoa(ticket.Id)))
	ctx.Set("role", user.Role)

	GetSupportTicketDetail(ctx)

	response = decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	var detail SupportTicketDetailResponse
	require.NoError(t, common.Unmarshal(response.Data, &detail))
	require.Equal(t, ticket.Id, detail.Ticket.Id)
	require.Len(t, detail.Messages, 1)
}

func TestSupportTicketUserCannotReadAnotherUsersTicket(t *testing.T) {
	db := setupSupportTicketControllerTestDB(t)
	user := seedUser(t, db, 7, "alice", common.RoleCommonUser)
	other := seedUser(t, db, 8, "bob", common.RoleCommonUser)
	ticket, err := model.CreateSupportTicket(other.Id, model.SupportTicketTypeNormal, "other", "secret")
	require.NoError(t, err)

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/support/tickets/1", nil, user.Id)
	ctx.Params = append(ctx.Params, ginParam("id", strconv.Itoa(ticket.Id)))
	ctx.Set("role", user.Role)

	GetSupportTicketDetail(ctx)

	response := decodeAPIResponse(t, recorder)
	require.False(t, response.Success)
	require.Contains(t, response.Message, "无权")
}

func TestSupportTicketAdminCanListAndReplyAllTickets(t *testing.T) {
	db := setupSupportTicketControllerTestDB(t)
	admin := seedUser(t, db, 1, "admin", common.RoleAdminUser)
	user := seedUser(t, db, 7, "alice", common.RoleCommonUser)
	ticket, err := model.CreateSupportTicket(user.Id, model.SupportTicketTypeNormal, "问题", "初始")
	require.NoError(t, err)

	ctx, recorder := newAuthenticatedContext(t, http.MethodGet, "/api/support/tickets", nil, admin.Id)
	ctx.Set("role", admin.Role)

	ListSupportTickets(ctx)

	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	var page common.PageInfo
	require.NoError(t, common.Unmarshal(response.Data, &page))
	require.Equal(t, 1, page.Total)

	ctx, recorder = newAuthenticatedContext(t, http.MethodPost, "/api/support/tickets/1/messages", map[string]any{
		"content": "请提供 request id",
	}, admin.Id)
	ctx.Params = append(ctx.Params, ginParam("id", strconv.Itoa(ticket.Id)))
	ctx.Set("role", admin.Role)

	AddSupportTicketMessage(ctx)

	response = decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	updated, err := model.GetSupportTicketById(ticket.Id)
	require.NoError(t, err)
	require.Equal(t, model.SupportTicketStatusInProgress, updated.Status)
}

func TestSupportTicketUserCanOnlyCloseOwnTicket(t *testing.T) {
	db := setupSupportTicketControllerTestDB(t)
	user := seedUser(t, db, 7, "alice", common.RoleCommonUser)
	ticket, err := model.CreateSupportTicket(user.Id, model.SupportTicketTypeNormal, "问题", "初始")
	require.NoError(t, err)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/support/tickets/1", map[string]any{
		"status": model.SupportTicketStatusClosed,
	}, user.Id)
	ctx.Params = append(ctx.Params, ginParam("id", strconv.Itoa(ticket.Id)))
	ctx.Set("role", user.Role)

	UpdateSupportTicket(ctx)

	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	updated, err := model.GetSupportTicketById(ticket.Id)
	require.NoError(t, err)
	require.Equal(t, model.SupportTicketStatusClosed, updated.Status)
}

func TestSupportTicketAdminUpdateStatusCreatesUserNotification(t *testing.T) {
	db := setupSupportTicketControllerTestDB(t)
	admin := seedUser(t, db, 1, "admin", common.RoleAdminUser)
	user := seedUser(t, db, 7, "alice", common.RoleCommonUser)
	ticket, err := model.CreateSupportTicket(user.Id, model.SupportTicketTypeNormal, "问题", "初始")
	require.NoError(t, err)

	ctx, recorder := newAuthenticatedContext(t, http.MethodPut, "/api/support/tickets/1", map[string]any{
		"status":   model.SupportTicketStatusResolved,
		"priority": model.SupportTicketPriorityHigh,
	}, admin.Id)
	ctx.Params = append(ctx.Params, ginParam("id", strconv.Itoa(ticket.Id)))
	ctx.Set("role", admin.Role)

	UpdateSupportTicket(ctx)

	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)

	var notification model.SiteNotification
	require.Eventually(t, func() bool {
		return model.DB.First(&notification).Error == nil
	}, time.Second, 10*time.Millisecond)
	require.Equal(t, user.Id, notification.UserId)
	require.Equal(t, admin.Id, notification.SenderUserId)
	require.Contains(t, notification.Title, "工单状态已更新")
	require.Contains(t, notification.Content, "已解决")
}

func TestSupportTicketAttachmentUploadStoresImageUnderSupportTicketPrefix(t *testing.T) {
	setupSupportTicketControllerTestDB(t)
	oldStorageBackend := common.StorageBackend
	common.StorageBackend = ""
	t.Cleanup(func() {
		common.StorageBackend = oldStorageBackend
	})

	tmpDir := t.TempDir()
	oldWd, err := os.Getwd()
	require.NoError(t, err)
	require.NoError(t, os.Chdir(tmpDir))
	t.Cleanup(func() {
		require.NoError(t, os.Chdir(oldWd))
	})

	ctx, recorder := newMultipartUploadContext(t, "/api/support/tickets/attachments", "screenshot.png", []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
	ctx.Set("id", 7)
	ctx.Set("role", common.RoleCommonUser)

	UploadSupportTicketAttachment(ctx)

	response := decodeAPIResponse(t, recorder)
	require.True(t, response.Success, response.Message)
	var data struct {
		URL string `json:"url"`
	}
	require.NoError(t, common.Unmarshal(response.Data, &data))
	require.Contains(t, data.URL, "/uploads/support_tickets/")
	require.Equal(t, ".png", filepath.Ext(data.URL))
	require.FileExists(t, filepath.Join(tmpDir, "data", data.URL))
}

func TestSupportTicketAttachmentUploadRejectsNonImage(t *testing.T) {
	setupSupportTicketControllerTestDB(t)

	ctx, recorder := newMultipartUploadContext(t, "/api/support/tickets/attachments", "payload.txt", []byte("plain text"))
	ctx.Set("id", 7)
	ctx.Set("role", common.RoleCommonUser)

	UploadSupportTicketAttachment(ctx)

	response := decodeAPIResponse(t, recorder)
	require.False(t, response.Success)
	require.Contains(t, response.Message, "仅允许")
}

func ginParam(key string, value string) gin.Param {
	return gin.Param{Key: key, Value: value}
}

func newMultipartUploadContext(t *testing.T, target string, filename string, content []byte) (*gin.Context, *httptest.ResponseRecorder) {
	t.Helper()

	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	part, err := writer.CreateFormFile("file", filename)
	require.NoError(t, err)
	_, err = part.Write(content)
	require.NoError(t, err)
	require.NoError(t, writer.Close())

	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodPost, target, &body)
	ctx.Request.Header.Set("Content-Type", writer.FormDataContentType())
	return ctx, recorder
}

package service

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type capturedSupportTicketEmail struct {
	To struct {
		Address string `json:"address"`
	} `json:"to"`
	Subject string `json:"subject"`
	HTML    string `json:"html"`
}

func withSupportTicketNotificationTestDB(t *testing.T, run func()) {
	t.Helper()

	oldDB := model.DB
	oldLogDB := model.LOG_DB
	oldUsingSQLite := common.UsingSQLite

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.SupportTicket{}, &model.SupportTicketMessage{}, &model.SiteNotification{}))

	model.DB = db
	model.LOG_DB = db
	common.UsingSQLite = true

	t.Cleanup(func() {
		model.DB = oldDB
		model.LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
	})

	run()
}

func withSupportTicketEmailCapture(t *testing.T) *[]capturedSupportTicketEmail {
	t.Helper()

	oldSenderType := common.EmailSenderType
	oldWorkerURL := common.CloudflareEmailWorkerURL
	oldWorkerToken := common.CloudflareEmailWorkerToken
	oldWorkerFromAddress := common.CloudflareEmailWorkerFromAddress
	oldWorkerFromName := common.CloudflareEmailWorkerFromName

	var mu sync.Mutex
	emails := make([]capturedSupportTicketEmail, 0, 2)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/send", r.URL.Path)
		require.Equal(t, "Bearer test-token", r.Header.Get("Authorization"))

		var payload capturedSupportTicketEmail
		require.NoError(t, common.DecodeJson(r.Body, &payload))
		mu.Lock()
		emails = append(emails, payload)
		mu.Unlock()

		_, _ = w.Write([]byte(`{"success":true}`))
	}))

	common.EmailSenderType = common.EmailSenderTypeCloudflareWorker
	common.CloudflareEmailWorkerURL = server.URL
	common.CloudflareEmailWorkerToken = "test-token"
	common.CloudflareEmailWorkerFromAddress = "noreply@example.com"
	common.CloudflareEmailWorkerFromName = "new-api"

	t.Cleanup(func() {
		server.Close()
		common.EmailSenderType = oldSenderType
		common.CloudflareEmailWorkerURL = oldWorkerURL
		common.CloudflareEmailWorkerToken = oldWorkerToken
		common.CloudflareEmailWorkerFromAddress = oldWorkerFromAddress
		common.CloudflareEmailWorkerFromName = oldWorkerFromName
	})

	return &emails
}

func TestSupportTicketCreatedNotificationEmailsBoundUser(t *testing.T) {
	withSupportTicketNotificationTestDB(t, func() {
		emails := withSupportTicketEmailCapture(t)
		user := &model.User{Id: 7, Username: "alice", Email: "alice@example.com", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: "alice"}
		require.NoError(t, model.DB.Create(user).Error)
		ticket, err := model.CreateSupportTicket(user.Id, model.SupportTicketTypeRefund, "退款问题", "订单 abc")
		require.NoError(t, err)

		notifySupportTicketCreated(user, ticket)

		require.Len(t, *emails, 2)
		require.Equal(t, "alice@example.com", (*emails)[0].To.Address)
		require.Contains(t, (*emails)[0].Subject, "工单已提交")
		require.Contains(t, (*emails)[0].HTML, "退款问题")
		require.Equal(t, "support@nbility.dev", (*emails)[1].To.Address)
		require.Contains(t, (*emails)[1].Subject, "新工单")
		require.Contains(t, (*emails)[1].HTML, "alice")
		require.Contains(t, (*emails)[1].HTML, "退款问题")
	})
}

func TestSupportTicketStatusNotificationCreatesSiteNotificationAndEmail(t *testing.T) {
	withSupportTicketNotificationTestDB(t, func() {
		emails := withSupportTicketEmailCapture(t)
		user := &model.User{Id: 7, Username: "alice", Email: "alice@example.com", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: "alice"}
		require.NoError(t, model.DB.Create(user).Error)
		ticket, err := model.CreateSupportTicket(user.Id, model.SupportTicketTypeNormal, "模型异常", "返回 500")
		require.NoError(t, err)
		ticket.Status = model.SupportTicketStatusResolved

		notifySupportTicketStatusUpdated(user, 1, ticket, model.SupportTicketStatusInProgress)

		var notifications []model.SiteNotification
		require.NoError(t, model.DB.Find(&notifications).Error)
		require.Len(t, notifications, 1)
		require.Equal(t, user.Id, notifications[0].UserId)
		require.Equal(t, 1, notifications[0].SenderUserId)
		require.Contains(t, notifications[0].Title, "工单状态已更新")
		require.Contains(t, notifications[0].Content, "已解决")
		require.True(t, notifications[0].EmailSent)
		require.Len(t, *emails, 1)
		require.Equal(t, "alice@example.com", (*emails)[0].To.Address)
		require.Contains(t, (*emails)[0].HTML, "模型异常")
	})
}

func TestSupportTicketStatusNotificationSkipsEmailWithoutBoundAddress(t *testing.T) {
	withSupportTicketNotificationTestDB(t, func() {
		emails := withSupportTicketEmailCapture(t)
		user := &model.User{Id: 7, Username: "alice", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: "alice"}
		require.NoError(t, model.DB.Create(user).Error)
		ticket, err := model.CreateSupportTicket(user.Id, model.SupportTicketTypeNormal, "模型异常", "返回 500")
		require.NoError(t, err)
		ticket.Status = model.SupportTicketStatusClosed

		notifySupportTicketStatusUpdated(user, 1, ticket, model.SupportTicketStatusResolved)

		var notification model.SiteNotification
		require.NoError(t, model.DB.First(&notification).Error)
		require.False(t, notification.EmailSent)
		require.Len(t, *emails, 0)
		require.True(t, strings.Contains(notification.Content, "已关闭"))
	})
}

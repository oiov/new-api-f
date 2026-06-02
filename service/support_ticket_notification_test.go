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

func TestSupportTicketUserReplyNotifiesAdminsBySiteAndEmail(t *testing.T) {
	withSupportTicketNotificationTestDB(t, func() {
		emails := withSupportTicketEmailCapture(t)
		user := &model.User{Id: 7, Username: "alice", Email: "alice@example.com", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: "alice"}
		admin := &model.User{Id: 1, Username: "admin", Email: "admin@example.com", Role: common.RoleAdminUser, Status: common.UserStatusEnabled, AffCode: "admin"}
		require.NoError(t, model.DB.Create(user).Error)
		require.NoError(t, model.DB.Create(admin).Error)
		ticket, err := model.CreateSupportTicket(user.Id, model.SupportTicketTypeNormal, "模型异常", "返回 500")
		require.NoError(t, err)
		message, _, err := model.AddSupportTicketMessage(ticket.Id, user.Id, false, "补充截图")
		require.NoError(t, err)

		notifySupportTicketMessageAdded(user.Id, ticket, message)

		var notifications []model.SiteNotification
		require.NoError(t, model.DB.Order("id asc").Find(&notifications).Error)
		require.Len(t, notifications, 1)
		require.Equal(t, admin.Id, notifications[0].UserId)
		require.Equal(t, user.Id, notifications[0].SenderUserId)
		require.Contains(t, notifications[0].Title, "工单有新回复")
		require.Contains(t, notifications[0].Content, "模型异常")
		require.True(t, notifications[0].EmailSent)

		require.Len(t, *emails, 2)
		require.Equal(t, "admin@example.com", (*emails)[0].To.Address)
		require.Equal(t, "support@nbility.dev", (*emails)[1].To.Address)
		require.Contains(t, (*emails)[0].HTML, "补充截图")
	})
}

func TestSupportTicketAdminReplyNotifiesOnlyTicketOwner(t *testing.T) {
	withSupportTicketNotificationTestDB(t, func() {
		emails := withSupportTicketEmailCapture(t)
		user := &model.User{Id: 7, Username: "alice", Email: "alice@example.com", Role: common.RoleCommonUser, Status: common.UserStatusEnabled, AffCode: "alice"}
		admin := &model.User{Id: 1, Username: "admin", Email: "admin@example.com", Role: common.RoleAdminUser, Status: common.UserStatusEnabled, AffCode: "admin"}
		otherAdmin := &model.User{Id: 2, Username: "root", Email: "root@example.com", Role: common.RoleRootUser, Status: common.UserStatusEnabled, AffCode: "root"}
		require.NoError(t, model.DB.Create(user).Error)
		require.NoError(t, model.DB.Create(admin).Error)
		require.NoError(t, model.DB.Create(otherAdmin).Error)
		ticket, err := model.CreateSupportTicket(user.Id, model.SupportTicketTypeNormal, "模型异常", "返回 500")
		require.NoError(t, err)
		message, _, err := model.AddSupportTicketMessage(ticket.Id, admin.Id, true, "已处理，请重试")
		require.NoError(t, err)

		notifySupportTicketMessageAdded(admin.Id, ticket, message)

		var notifications []model.SiteNotification
		require.NoError(t, model.DB.Order("user_id asc").Find(&notifications).Error)
		require.Len(t, notifications, 1)
		require.Equal(t, admin.Id, notifications[0].SenderUserId)
		require.Equal(t, user.Id, notifications[0].UserId)
		require.Contains(t, notifications[0].Title, "工单收到回复")
		require.True(t, notifications[0].EmailSent)

		require.Len(t, *emails, 1)
		require.Equal(t, "alice@example.com", (*emails)[0].To.Address)
		require.NotEqual(t, admin.Email, (*emails)[0].To.Address)
		require.NotEqual(t, otherAdmin.Email, (*emails)[0].To.Address)
		require.NotEqual(t, supportTicketAdminEmail, (*emails)[0].To.Address)
		require.Contains(t, (*emails)[0].HTML, "已处理")
	})
}

func TestSupportTicketEmailTemplateEscapesUserContent(t *testing.T) {
	ticket := &model.SupportTicket{
		Id:       42,
		Type:     model.SupportTicketTypeNormal,
		Subject:  `<script>alert("ticket")</script>`,
		Status:   model.SupportTicketStatusInProgress,
		Priority: model.SupportTicketPriorityUrgent,
	}
	message := &model.SupportTicketMessage{
		Content:  `<img src=x onerror="alert(1)"> please check`,
		ImageURL: `https://example.com/a.png?name=<bad>&q="1"`,
	}

	content := buildSupportTicketMessageEmailContent("New support ticket reply", ticket, message, SupportTicketEmailLanguageEn)

	require.Contains(t, content, "&lt;script&gt;alert(&#34;ticket&#34;)&lt;/script&gt;")
	require.Contains(t, content, "&lt;img src=x onerror=&#34;alert(1)&#34;&gt; please check")
	require.NotContains(t, content, "<script>alert")
	require.NotContains(t, content, "<img src=x")
	require.Contains(t, content, `href="https://example.com/a.png?name=&lt;bad&gt;&amp;q=&#34;1&#34;"`)
	require.Contains(t, content, "In progress")
	require.Contains(t, content, "Urgent")
	require.Contains(t, content, "View ticket")
	require.Contains(t, content, "/console/support-tickets/42")
	require.Contains(t, content, "background:")
}

func TestSupportTicketEmailTemplateDefaultsToEnglish(t *testing.T) {
	ticket := &model.SupportTicket{
		Id:       42,
		Type:     model.SupportTicketTypeNormal,
		Subject:  "Model issue",
		Status:   model.SupportTicketStatusResolved,
		Priority: model.SupportTicketPriorityHigh,
	}
	message := &model.SupportTicketMessage{Content: "Please retry"}

	require.Equal(t, SupportTicketEmailLanguageEn, normalizeSupportTicketEmailLanguage(""))
	require.Equal(t, SupportTicketEmailLanguageEn, normalizeSupportTicketEmailLanguage("fr"))
	require.Equal(t, SupportTicketEmailLanguageZh, normalizeSupportTicketEmailLanguage(" zh "))
	require.Equal(t, "Resolved", supportTicketEmailStatusText(ticket.Status, ""))
	require.Equal(t, "High", supportTicketEmailPriorityText(ticket.Priority, ""))

	content := buildSupportTicketMessageEmailContent("New support ticket reply", ticket, message, "")

	require.Contains(t, content, "New support ticket reply")
	require.Contains(t, content, "Status")
	require.Contains(t, content, "Resolved")
	require.Contains(t, content, "Priority")
	require.Contains(t, content, "High")
	require.Contains(t, content, "View ticket")
	require.NotContains(t, content, "查看工单")
}

package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

type legacySupportTicketTrialApplication struct {
	RequestIP string `gorm:"column:request_ip;type:varchar(64);uniqueIndex"`
}

func (legacySupportTicketTrialApplication) TableName() string {
	return "support_ticket_trial_applications"
}

func withSupportTicketTestDB(t *testing.T, run func()) {
	t.Helper()

	oldDB := DB
	oldLogDB := LOG_DB
	oldUsingSQLite := common.UsingSQLite

	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)

	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)

	DB = db
	LOG_DB = db
	common.UsingSQLite = true

	require.NoError(t, db.AutoMigrate(&User{}, &SupportTicket{}, &SupportTicketMessage{}, &Redemption{}, &SupportTicketTrialApplication{}))

	t.Cleanup(func() {
		DB = oldDB
		LOG_DB = oldLogDB
		common.UsingSQLite = oldUsingSQLite
	})

	run()
}

func TestSupportTicketCreateSetsDefaultPriorityAndFirstMessage(t *testing.T) {
	withSupportTicketTestDB(t, func() {
		ticket, err := CreateSupportTicket(7, SupportTicketTypeNormal, "  API 异常  ", "  返回 500  ")
		require.NoError(t, err)
		require.Equal(t, SupportTicketTypeNormal, ticket.Type)
		require.Equal(t, "API 异常", ticket.Subject)
		require.Equal(t, SupportTicketStatusPending, ticket.Status)
		require.Equal(t, SupportTicketPriorityNormal, ticket.Priority)
		require.NotZero(t, ticket.LastMessageAt)

		messages, err := GetSupportTicketMessages(ticket.Id)
		require.NoError(t, err)
		require.Len(t, messages, 1)
		require.Equal(t, "返回 500", messages[0].Content)
		require.Equal(t, 7, messages[0].SenderUserId)
		require.False(t, messages[0].IsAdmin)
	})
}

func TestSupportTicketCreateStoresOptionalMessageImageURL(t *testing.T) {
	withSupportTicketTestDB(t, func() {
		ticket, err := CreateSupportTicketWithImage(7, SupportTicketTypeNormal, "图片问题", "请看截图", " /uploads/support_tickets/test.png ")
		require.NoError(t, err)

		messages, err := GetSupportTicketMessages(ticket.Id)
		require.NoError(t, err)
		require.Len(t, messages, 1)
		require.Equal(t, "请看截图", messages[0].Content)
		require.Equal(t, "/uploads/support_tickets/test.png", messages[0].ImageURL)
	})
}

func TestSupportTicketReplyStoresOptionalMessageImageURLAndStillRequiresText(t *testing.T) {
	withSupportTicketTestDB(t, func() {
		ticket, err := CreateSupportTicket(7, SupportTicketTypeNormal, "问题", "初始消息")
		require.NoError(t, err)

		_, _, err = AddSupportTicketMessageWithImage(ticket.Id, 7, false, "   ", "/uploads/support_tickets/empty.png")
		require.EqualError(t, err, "工单内容不能为空")

		_, _, err = AddSupportTicketMessageWithImage(ticket.Id, 7, false, "补充截图", "https://cdn.example.com/support.png")
		require.EqualError(t, err, "无效的工单图片链接")

		message, _, err := AddSupportTicketMessageWithImage(ticket.Id, 7, false, "补充截图", "/uploads/support_tickets/reply.png")
		require.NoError(t, err)
		require.Equal(t, "补充截图", message.Content)
		require.Equal(t, "/uploads/support_tickets/reply.png", message.ImageURL)
	})
}

func TestSupportTicketCreateSetsHighPriorityForRefundAndInvoice(t *testing.T) {
	withSupportTicketTestDB(t, func() {
		refundTicket, err := CreateSupportTicket(7, SupportTicketTypeRefund, "退款", "申请退款")
		require.NoError(t, err)
		require.Equal(t, SupportTicketPriorityHigh, refundTicket.Priority)

		invoiceTicket, err := CreateSupportTicket(7, SupportTicketTypeInvoice, "发票", "申请发票")
		require.NoError(t, err)
		require.Equal(t, SupportTicketPriorityHigh, invoiceTicket.Priority)
	})
}

func TestSupportTicketRejectsInvalidTypeStatusAndPriority(t *testing.T) {
	withSupportTicketTestDB(t, func() {
		_, err := CreateSupportTicket(7, "unknown", "问题", "初始消息")
		require.EqualError(t, err, "无效的工单类型")

		ticket, err := CreateSupportTicket(7, SupportTicketTypeNormal, "问题", "初始消息")
		require.NoError(t, err)

		_, err = UpdateSupportTicketByAdmin(ticket.Id, "unknown", "")
		require.EqualError(t, err, "无效的工单状态")

		_, err = UpdateSupportTicketByAdmin(ticket.Id, "", "unknown")
		require.EqualError(t, err, "无效的工单优先级")

		unchanged, err := UpdateSupportTicketByAdmin(ticket.Id, "", "")
		require.NoError(t, err)
		require.Equal(t, SupportTicketStatusPending, unchanged.Status)
		require.Equal(t, SupportTicketPriorityNormal, unchanged.Priority)
	})
}

func TestSupportTicketListScopesUsersAndAllowsAdminAllTickets(t *testing.T) {
	withSupportTicketTestDB(t, func() {
		require.NoError(t, DB.Create(&User{Id: 7, Username: "alice", AffCode: "alice"}).Error)
		require.NoError(t, DB.Create(&User{Id: 8, Username: "bob", AffCode: "bob"}).Error)
		_, err := CreateSupportTicket(7, SupportTicketTypeNormal, "Alice ticket", "a")
		require.NoError(t, err)
		_, err = CreateSupportTicket(8, SupportTicketTypeRefund, "Bob ticket", "b")
		require.NoError(t, err)

		page := &common.PageInfo{Page: 1, PageSize: 20}
		userItems, total, err := ListSupportTickets(7, false, page, SupportTicketFilters{})
		require.NoError(t, err)
		require.EqualValues(t, 1, total)
		require.Len(t, userItems, 1)
		require.Equal(t, "Alice ticket", userItems[0].Subject)

		adminItems, total, err := ListSupportTickets(0, true, page, SupportTicketFilters{})
		require.NoError(t, err)
		require.EqualValues(t, 2, total)
		require.Len(t, adminItems, 2)
		require.Equal(t, "bob", adminItems[0].Username)
	})
}

func TestSupportTicketUserKeywordSearchDoesNotMatchUsername(t *testing.T) {
	withSupportTicketTestDB(t, func() {
		require.NoError(t, DB.Create(&User{Id: 7, Username: "alice", AffCode: "alice"}).Error)
		require.NoError(t, DB.Create(&User{Id: 8, Username: "bob", AffCode: "bob"}).Error)
		_, err := CreateSupportTicket(7, SupportTicketTypeNormal, "API issue", "a")
		require.NoError(t, err)
		_, err = CreateSupportTicket(8, SupportTicketTypeNormal, "Billing issue", "b")
		require.NoError(t, err)

		page := &common.PageInfo{Page: 1, PageSize: 20}
		userItems, total, err := ListSupportTickets(7, false, page, SupportTicketFilters{Keyword: "alice"})
		require.NoError(t, err)
		require.EqualValues(t, 0, total)
		require.Empty(t, userItems)

		adminItems, total, err := ListSupportTickets(0, true, page, SupportTicketFilters{Keyword: "alice"})
		require.NoError(t, err)
		require.EqualValues(t, 1, total)
		require.Len(t, adminItems, 1)
		require.Equal(t, "API issue", adminItems[0].Subject)
	})
}

func TestSupportTicketAdminReplyMovesPendingToInProgress(t *testing.T) {
	withSupportTicketTestDB(t, func() {
		ticket, err := CreateSupportTicket(7, SupportTicketTypeNormal, "问题", "初始消息")
		require.NoError(t, err)

		message, updated, err := AddSupportTicketMessage(ticket.Id, 1, true, "请提供 request id")
		require.NoError(t, err)
		require.True(t, message.IsAdmin)
		require.Equal(t, SupportTicketStatusInProgress, updated.Status)
		require.NotZero(t, updated.LastMessageAt)
	})
}

func TestSupportTicketClosedRejectsNewMessagesUntilAdminReopens(t *testing.T) {
	withSupportTicketTestDB(t, func() {
		ticket, err := CreateSupportTicket(7, SupportTicketTypeNormal, "问题", "初始消息")
		require.NoError(t, err)
		_, err = UpdateSupportTicketByAdmin(ticket.Id, SupportTicketStatusClosed, "")
		require.NoError(t, err)

		_, _, err = AddSupportTicketMessage(ticket.Id, 7, false, "继续追问")
		require.EqualError(t, err, "已关闭的工单不能继续回复")

		reopened, err := UpdateSupportTicketByAdmin(ticket.Id, SupportTicketStatusInProgress, "")
		require.NoError(t, err)
		require.Equal(t, SupportTicketStatusInProgress, reopened.Status)

		_, _, err = AddSupportTicketMessage(ticket.Id, 7, false, "补充信息")
		require.NoError(t, err)
	})
}

func TestSupportTicketReplyAndCloseDoNotOverwriteConcurrentPriorityChanges(t *testing.T) {
	withSupportTicketTestDB(t, func() {
		ticket, err := CreateSupportTicket(7, SupportTicketTypeNormal, "问题", "初始消息")
		require.NoError(t, err)

		var injected bool
		var callbackErr error
		callbackName := "support_ticket_test_priority_update"
		require.NoError(t, DB.Callback().Update().Before("gorm:update").Register(callbackName, func(tx *gorm.DB) {
			if injected || tx.Statement == nil || tx.Statement.Table != "support_tickets" {
				return
			}
			injected = true
			callbackErr = tx.Session(&gorm.Session{NewDB: true}).
				Model(&SupportTicket{}).
				Where("id = ?", ticket.Id).
				Update("priority", SupportTicketPriorityUrgent).Error
		}))
		t.Cleanup(func() {
			require.NoError(t, DB.Callback().Update().Remove(callbackName))
		})

		_, updated, err := AddSupportTicketMessage(ticket.Id, 7, false, "补充信息")
		require.NoError(t, callbackErr)
		require.NoError(t, err)
		require.Equal(t, SupportTicketPriorityUrgent, updated.Priority)

		require.NoError(t, DB.Model(&SupportTicket{}).Where("id = ?", ticket.Id).Update("priority", SupportTicketPriorityNormal).Error)
		injected = false
		closed, err := CloseSupportTicketByUser(ticket.Id, 7)
		require.NoError(t, callbackErr)
		require.NoError(t, err)
		require.Equal(t, SupportTicketStatusClosed, closed.Status)
		require.Equal(t, SupportTicketPriorityUrgent, closed.Priority)
	})
}

func TestSupportTicketUserCanOnlyCloseOwnTicket(t *testing.T) {
	withSupportTicketTestDB(t, func() {
		ticket, err := CreateSupportTicket(7, SupportTicketTypeNormal, "问题", "初始消息")
		require.NoError(t, err)

		_, err = CloseSupportTicketByUser(ticket.Id, 8)
		require.EqualError(t, err, "工单不存在")

		closed, err := CloseSupportTicketByUser(ticket.Id, 7)
		require.NoError(t, err)
		require.Equal(t, SupportTicketStatusClosed, closed.Status)
	})
}

func TestCreateSupportTicketTrialApplicationEnforcesUserAndIP(t *testing.T) {
	withSupportTicketTestDB(t, func() {
		require.NoError(t, DB.Create(&User{Id: 7, Username: "alice", AffCode: "alice"}).Error)
		require.NoError(t, DB.Create(&User{Id: 8, Username: "bob", AffCode: "bob"}).Error)
		require.NoError(t, DB.Create(&User{Id: 9, Username: "carol", AffCode: "carol"}).Error)
		first, err := CreateSupportTicket(7, SupportTicketTypeNormal, "试用", "想申请试用")
		require.NoError(t, err)
		second, err := CreateSupportTicket(8, SupportTicketTypeNormal, "试用", "也想申请")
		require.NoError(t, err)
		third, err := CreateSupportTicket(9, SupportTicketTypeNormal, "试用", "同 IP 申请")
		require.NoError(t, err)
		fourth, err := CreateSupportTicket(8, SupportTicketTypeNormal, "试用", "空 IP 也能申请")
		require.NoError(t, err)

		application, message, updated, err := CreateSupportTicketTrialApplication(first.Id, 7, "203.0.113.10")
		require.NoError(t, err)
		require.Equal(t, SupportTicketTrialApplicationStatusPending, application.Status)
		require.Equal(t, "203.0.113.10", application.RequestIP)
		require.Contains(t, message.Content, "$5")
		require.Contains(t, message.Content, "trial quota application submitted")
		require.Equal(t, first.Id, updated.Id)

		// Same user, same IP — blocked by user check
		_, _, _, err = CreateSupportTicketTrialApplication(first.Id, 7, "203.0.113.10")
		require.EqualError(t, err, "你已经提交过试用额度申请")

		// Different user, same IP — blocked by IP check
		_, _, _, err = CreateSupportTicketTrialApplication(third.Id, 9, "203.0.113.10")
		require.EqualError(t, err, "该 IP 地址已提交过试用额度申请")

		// Different user, different IP — allowed
		_, _, _, err = CreateSupportTicketTrialApplication(second.Id, 8, "198.51.100.20")
		require.NoError(t, err)

		// After deleting user 8's application, same user can re-apply with empty IP
		require.NoError(t, DB.Delete(&SupportTicketTrialApplication{}, "user_id = ?", 8).Error)
		_, _, _, err = CreateSupportTicketTrialApplication(fourth.Id, 8, "")
		require.NoError(t, err)
	})
}

func TestMigrateSupportTicketTrialApplicationRequestIPCompatibilityDropsUniqueIndex(t *testing.T) {
	withSupportTicketTestDB(t, func() {
		require.NoError(t, DB.Migrator().CreateIndex(&legacySupportTicketTrialApplication{}, "RequestIP"))
		require.NoError(t, migrateSupportTicketTrialApplicationRequestIPCompatibility())

		require.NoError(t, DB.Create(&SupportTicketTrialApplication{
			TicketId:  1,
			UserId:    7,
			RequestIP: "203.0.113.10",
			Status:    SupportTicketTrialApplicationStatusPending,
		}).Error)
		require.NoError(t, DB.Create(&SupportTicketTrialApplication{
			TicketId:  2,
			UserId:    8,
			RequestIP: "203.0.113.10",
			Status:    SupportTicketTrialApplicationStatusPending,
		}).Error)
	})
}

func TestReviewSupportTicketTrialApplicationApprovesWithRedemption(t *testing.T) {
	withSupportTicketTestDB(t, func() {
		oldQuotaPerUnit := common.QuotaPerUnit
		common.QuotaPerUnit = 100
		t.Cleanup(func() {
			common.QuotaPerUnit = oldQuotaPerUnit
		})
		require.NoError(t, DB.Create(&User{Id: 7, Username: "alice", AffCode: "alice"}).Error)
		ticket, err := CreateSupportTicket(7, SupportTicketTypeNormal, "试用", "想申请试用")
		require.NoError(t, err)
		_, _, _, err = CreateSupportTicketTrialApplication(ticket.Id, 7, "10.0.0.1")
		require.NoError(t, err)

		application, message, updated, err := ReviewSupportTicketTrialApplication(ticket.Id, 1, true)
		require.NoError(t, err)
		require.Equal(t, SupportTicketTrialApplicationStatusApproved, application.Status)
		require.Equal(t, 1, application.ReviewerUserId)
		require.NotZero(t, application.RedemptionId)
		require.NotEmpty(t, application.RedemptionKey)
		require.Contains(t, message.Content, application.RedemptionKey)
		require.Contains(t, message.Content, "was approved")
		require.NotContains(t, message.Content, "兑换码")
		require.Contains(t, message.Content, "https://nbility.dev/console/topup")
		require.Equal(t, SupportTicketStatusInProgress, updated.Status)

		var redemption Redemption
		require.NoError(t, DB.First(&redemption, "id = ?", application.RedemptionId).Error)
		require.Equal(t, 500, redemption.Quota)
		require.Equal(t, RedemptionTypeQuota, redemption.RedemptionType)
		require.Equal(t, common.RedemptionCodeStatusEnabled, redemption.Status)
	})
}

func TestReviewSupportTicketTrialApplicationRejectsWithoutRedemption(t *testing.T) {
	withSupportTicketTestDB(t, func() {
		require.NoError(t, DB.Create(&User{Id: 7, Username: "alice", AffCode: "alice"}).Error)
		ticket, err := CreateSupportTicket(7, SupportTicketTypeNormal, "试用", "想申请试用")
		require.NoError(t, err)
		_, _, _, err = CreateSupportTicketTrialApplication(ticket.Id, 7, "10.0.0.2")
		require.NoError(t, err)

		application, message, _, err := ReviewSupportTicketTrialApplication(ticket.Id, 1, false)
		require.NoError(t, err)
		require.Equal(t, SupportTicketTrialApplicationStatusRejected, application.Status)
		require.Zero(t, application.RedemptionId)
		require.Empty(t, application.RedemptionKey)
		require.Contains(t, message.Content, "not approved")
		require.NotContains(t, message.Content, "未通过")

		var count int64
		require.NoError(t, DB.Model(&Redemption{}).Count(&count).Error)
		require.EqualValues(t, 0, count)
	})
}

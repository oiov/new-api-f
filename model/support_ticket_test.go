package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

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

	require.NoError(t, db.AutoMigrate(&User{}, &SupportTicket{}, &SupportTicketMessage{}))

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

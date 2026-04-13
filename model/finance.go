package model

import (
	"fmt"
	"sort"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
)

type FinanceSummary struct {
	TotalRevenue         float64 `json:"total_revenue"`
	SuccessfulTopUpCount int64   `json:"successful_topup_count"`
	AverageOrderValue    float64 `json:"average_order_value"`
	PendingInvoiceAmount float64 `json:"pending_invoice_amount"`
	IssuedInvoiceAmount  float64 `json:"issued_invoice_amount"`
	InvoiceCount         int64   `json:"invoice_count"`
}

type FinanceTrendPoint struct {
	Label         string  `json:"label"`
	RevenueAmount float64 `json:"revenue_amount"`
	InvoiceAmount float64 `json:"invoice_amount"`
	OrderCount    int64   `json:"order_count"`
}

type FinanceDistributionItem struct {
	Name   string  `json:"name"`
	Value  float64 `json:"value"`
	Count  int64   `json:"count"`
	Amount float64 `json:"amount"`
}

type FinanceUserRanking struct {
	UserId      int     `json:"user_id"`
	Username    string  `json:"username"`
	DisplayName string  `json:"display_name"`
	OrderCount  int64   `json:"order_count"`
	Revenue     float64 `json:"revenue"`
}

type FinanceRecentOrder struct {
	Id            int     `json:"id"`
	UserId        int     `json:"user_id"`
	Username      string  `json:"username"`
	TradeNo       string  `json:"trade_no"`
	PaymentMethod string  `json:"payment_method"`
	Money         float64 `json:"money"`
	Status        string  `json:"status"`
	CreateTime    int64   `json:"create_time"`
	CompleteTime  int64   `json:"complete_time"`
}

type FinanceOverview struct {
	StartTimestamp int64                     `json:"start_timestamp"`
	EndTimestamp   int64                     `json:"end_timestamp"`
	Granularity    string                    `json:"granularity"`
	Summary        FinanceSummary            `json:"summary"`
	RevenueTrend   []FinanceTrendPoint       `json:"revenue_trend"`
	PaymentMethods []FinanceDistributionItem `json:"payment_methods"`
	InvoiceStatus  []FinanceDistributionItem `json:"invoice_status"`
	TopUsers       []FinanceUserRanking      `json:"top_users"`
	RecentOrders   []FinanceRecentOrder      `json:"recent_orders"`
}

type financeTopUpTrendRow struct {
	Money        float64
	CompleteTime int64
}

type financeInvoiceTrendRow struct {
	Amount     float64
	CreateTime int64
}

type financePaymentMethodRow struct {
	Name   string
	Amount float64
	Count  int64
}

type financeInvoiceStatusRow struct {
	Name   string
	Amount float64
	Count  int64
}

type financeTopUserRow struct {
	UserId      int
	Username    string
	DisplayName string
	OrderCount  int64
	Revenue     float64
}

type financeRecentOrderRow struct {
	Id            int
	UserId        int
	Username      string
	TradeNo       string
	PaymentMethod string
	Money         float64
	Status        string
	CreateTime    int64
	CompleteTime  int64
}

func GetFinanceOverview(startTimestamp int64, endTimestamp int64, granularity string) (*FinanceOverview, error) {
	overview := &FinanceOverview{
		StartTimestamp: startTimestamp,
		EndTimestamp:   endTimestamp,
		Granularity:    granularity,
		RevenueTrend:   make([]FinanceTrendPoint, 0),
		PaymentMethods: make([]FinanceDistributionItem, 0),
		InvoiceStatus:  make([]FinanceDistributionItem, 0),
		TopUsers:       make([]FinanceUserRanking, 0),
		RecentOrders:   make([]FinanceRecentOrder, 0),
	}

	var topUpTrendRows []financeTopUpTrendRow
	if err := DB.Table("top_ups").
		Select("money, complete_time").
		Where("status = ? AND complete_time >= ? AND complete_time <= ?", common.TopUpStatusSuccess, startTimestamp, endTimestamp).
		Order("complete_time asc").
		Scan(&topUpTrendRows).Error; err != nil {
		return nil, err
	}

	var paymentMethodRows []financePaymentMethodRow
	if err := DB.Table("top_ups").
		Select("payment_method AS name, COALESCE(SUM(money), 0) AS amount, COUNT(*) AS count").
		Where("status = ? AND complete_time >= ? AND complete_time <= ?", common.TopUpStatusSuccess, startTimestamp, endTimestamp).
		Group("payment_method").
		Order("amount desc").
		Scan(&paymentMethodRows).Error; err != nil {
		return nil, err
	}

	var invoiceStatusRows []financeInvoiceStatusRow
	if err := DB.Table("invoices").
		Select("status AS name, COALESCE(SUM(amount), 0) AS amount, COUNT(*) AS count").
		Where("create_time >= ? AND create_time <= ?", startTimestamp, endTimestamp).
		Group("status").
		Order("amount desc").
		Scan(&invoiceStatusRows).Error; err != nil {
		return nil, err
	}

	var invoiceTrendRows []financeInvoiceTrendRow
	if err := DB.Table("invoices").
		Select("amount, create_time").
		Where("create_time >= ? AND create_time <= ?", startTimestamp, endTimestamp).
		Order("create_time asc").
		Scan(&invoiceTrendRows).Error; err != nil {
		return nil, err
	}

	var topUserRows []financeTopUserRow
	if err := DB.Table("top_ups").
		Select("top_ups.user_id, users.username, users.display_name, COUNT(top_ups.id) AS order_count, COALESCE(SUM(top_ups.money), 0) AS revenue").
		Joins("LEFT JOIN users ON top_ups.user_id = users.id").
		Where("top_ups.status = ? AND top_ups.complete_time >= ? AND top_ups.complete_time <= ?", common.TopUpStatusSuccess, startTimestamp, endTimestamp).
		Group("top_ups.user_id, users.username, users.display_name").
		Order("revenue desc").
		Limit(8).
		Scan(&topUserRows).Error; err != nil {
		return nil, err
	}

	for _, item := range topUserRows {
		overview.TopUsers = append(overview.TopUsers, FinanceUserRanking{
			UserId:      item.UserId,
			Username:    item.Username,
			DisplayName: item.DisplayName,
			OrderCount:  item.OrderCount,
			Revenue:     item.Revenue,
		})
	}

	var recentOrderRows []financeRecentOrderRow
	if err := DB.Table("top_ups").
		Select("top_ups.id, top_ups.user_id, users.username, top_ups.trade_no, top_ups.payment_method, top_ups.money, top_ups.status, top_ups.create_time, top_ups.complete_time").
		Joins("LEFT JOIN users ON top_ups.user_id = users.id").
		Where("top_ups.complete_time >= ? AND top_ups.complete_time <= ?", startTimestamp, endTimestamp).
		Order("top_ups.complete_time desc").
		Limit(10).
		Scan(&recentOrderRows).Error; err != nil {
		return nil, err
	}

	for _, item := range recentOrderRows {
		overview.RecentOrders = append(overview.RecentOrders, FinanceRecentOrder{
			Id:            item.Id,
			UserId:        item.UserId,
			Username:      item.Username,
			TradeNo:       item.TradeNo,
			PaymentMethod: item.PaymentMethod,
			Money:         item.Money,
			Status:        item.Status,
			CreateTime:    item.CreateTime,
			CompleteTime:  item.CompleteTime,
		})
	}

	revenueBucketMap := make(map[string]*FinanceTrendPoint)
	for _, row := range topUpTrendRows {
		label := formatFinanceBucketLabel(row.CompleteTime, granularity)
		bucket := ensureFinanceTrendBucket(revenueBucketMap, label)
		bucket.RevenueAmount += row.Money
		bucket.OrderCount += 1
		overview.Summary.TotalRevenue += row.Money
		overview.Summary.SuccessfulTopUpCount += 1
	}

	invoiceCount := int64(0)
	for _, row := range invoiceTrendRows {
		label := formatFinanceBucketLabel(row.CreateTime, granularity)
		bucket := ensureFinanceTrendBucket(revenueBucketMap, label)
		bucket.InvoiceAmount += row.Amount
		invoiceCount += 1
	}

	overview.Summary.InvoiceCount = invoiceCount
	if overview.Summary.SuccessfulTopUpCount > 0 {
		overview.Summary.AverageOrderValue = overview.Summary.TotalRevenue / float64(overview.Summary.SuccessfulTopUpCount)
	}

	for _, item := range invoiceStatusRows {
		switch item.Name {
		case InvoiceStatusPending:
			overview.Summary.PendingInvoiceAmount += item.Amount
		case InvoiceStatusIssued, InvoiceStatusSent:
			overview.Summary.IssuedInvoiceAmount += item.Amount
		}
	}

	labels := make([]string, 0, len(revenueBucketMap))
	for label := range revenueBucketMap {
		labels = append(labels, label)
	}
	sort.Strings(labels)
	for _, label := range labels {
		overview.RevenueTrend = append(overview.RevenueTrend, *revenueBucketMap[label])
	}

	for _, item := range paymentMethodRows {
		overview.PaymentMethods = append(overview.PaymentMethods, FinanceDistributionItem{
			Name:   normalizeFinanceName(item.Name, "unknown"),
			Value:  item.Amount,
			Count:  item.Count,
			Amount: item.Amount,
		})
	}
	for _, item := range invoiceStatusRows {
		overview.InvoiceStatus = append(overview.InvoiceStatus, FinanceDistributionItem{
			Name:   normalizeFinanceName(item.Name, InvoiceStatusPending),
			Value:  item.Amount,
			Count:  item.Count,
			Amount: item.Amount,
		})
	}

	return overview, nil
}

func ensureFinanceTrendBucket(bucketMap map[string]*FinanceTrendPoint, label string) *FinanceTrendPoint {
	if item, ok := bucketMap[label]; ok {
		return item
	}
	item := &FinanceTrendPoint{Label: label}
	bucketMap[label] = item
	return item
}

func formatFinanceBucketLabel(timestamp int64, granularity string) string {
	tm := time.Unix(timestamp, 0).In(time.Local)
	switch granularity {
	case "month":
		return tm.Format("2006-01")
	case "week":
		year, week := tm.ISOWeek()
		weekday := int(tm.Weekday())
		if weekday == 0 {
			weekday = 7
		}
		weekStart := time.Date(tm.Year(), tm.Month(), tm.Day(), 0, 0, 0, 0, time.Local).AddDate(0, 0, 1-weekday)
		return weekStart.Format("2006-01-02") + " (W" + formatWeek(year, week) + ")"
	default:
		return tm.Format("2006-01-02")
	}
}

func formatWeek(year int, week int) string {
	return fmt.Sprintf("%d-%02d", year, week)
}

func normalizeFinanceName(name string, fallback string) string {
	trimmed := strings.TrimSpace(name)
	if trimmed == "" {
		return fallback
	}
	return trimmed
}

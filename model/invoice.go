package model

import (
	"errors"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

const (
	InvoiceStatusPending  = "pending"  // 待开具
	InvoiceStatusIssued   = "issued"   // 已开具
	InvoiceStatusRejected = "rejected" // 已拒绝
	InvoiceStatusSent     = "sent"     // 已发送邮件
)

// MinInvoiceAmount 最低开票金额（元）
const MinInvoiceAmount = 50.0

type Invoice struct {
	Id         int     `json:"id" gorm:"primaryKey;autoIncrement"`
	UserId     int     `json:"user_id" gorm:"index;not null"`
	Username   string  `json:"username,omitempty" gorm:"-"`
	Title      string  `json:"title" gorm:"type:varchar(200);not null"`        // 发票抬头
	TaxId      string  `json:"tax_id" gorm:"type:varchar(100)"`                // 税号（企业填写）
	Email      string  `json:"email" gorm:"type:varchar(200);not null"`        // 接收邮箱
	Amount     float64 `json:"amount" gorm:"not null"`                         // 发票总金额（元）
	TopUpIds   string  `json:"topup_ids" gorm:"type:text;not null"`            // 关联充值ID（逗号分隔）
	Status     string  `json:"status" gorm:"type:varchar(20);default:pending"` // 状态
	FileUrl    string  `json:"file_url,omitempty" gorm:"type:text"`            // 发票文件URL
	Remark     string  `json:"remark,omitempty" gorm:"type:text"`              // 备注/拒绝原因
	CreateTime int64   `json:"create_time"`
	UpdateTime int64   `json:"update_time"`
}

type InvoiceAdminFilters struct {
	UserId   int
	Status   string
	Keyword  string
}

// Insert 创建发票申请（同时标记关联充值记录为已开票）
func (inv *Invoice) Insert(topUpIDs []int) error {
	return DB.Transaction(func(tx *gorm.DB) error {
		// 检查这些充值记录是否属于该用户且未被开票
		var count int64
		err := tx.Model(&TopUp{}).
			Where("id IN ? AND user_id = ? AND status = ? AND (invoiced = ? OR invoiced IS NULL)",
				topUpIDs, inv.UserId, common.TopUpStatusSuccess, false).
			Count(&count).Error
		if err != nil {
			return err
		}
		if int(count) != len(topUpIDs) {
			return errors.New("存在无效或已开票的充值记录")
		}

		// 标记充值记录为已开票
		err = tx.Model(&TopUp{}).
			Where("id IN ?", topUpIDs).
			Update("invoiced", true).Error
		if err != nil {
			return err
		}

		// 创建发票申请
		inv.CreateTime = common.GetTimestamp()
		inv.UpdateTime = common.GetTimestamp()
		return tx.Create(inv).Error
	})
}

// Update 更新发票（管理员开具/拒绝）
func (inv *Invoice) Update() error {
	inv.UpdateTime = common.GetTimestamp()
	return DB.Save(inv).Error
}

// Reject 拒绝并释放已锁定的充值记录
func (inv *Invoice) Reject(remark string) error {
	if inv.Status != InvoiceStatusPending {
		return errors.New("只能拒绝待开具的发票申请")
	}
	return DB.Transaction(func(tx *gorm.DB) error {
		// 解锁充值记录
		ids := parseTopUpIds(inv.TopUpIds)
		if len(ids) > 0 {
			err := tx.Model(&TopUp{}).Where("id IN ?", ids).Update("invoiced", false).Error
			if err != nil {
				return err
			}
		}
		// 更新发票状态
		inv.Status = InvoiceStatusRejected
		inv.Remark = remark
		inv.UpdateTime = common.GetTimestamp()
		return tx.Save(inv).Error
	})
}

func GetInvoiceById(id int) (*Invoice, error) {
	var inv Invoice
	err := DB.Where("id = ?", id).First(&inv).Error
	if err != nil {
		return nil, err
	}
	return &inv, nil
}

func GetUserInvoices(userId int, pageInfo *common.PageInfo) ([]*Invoice, int64, error) {
	var invoices []*Invoice
	var total int64

	query := DB.Model(&Invoice{}).Where("user_id = ?", userId)
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	err := query.Order("id desc").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&invoices).Error
	return invoices, total, err
}

func GetAllInvoices(pageInfo *common.PageInfo, filters InvoiceAdminFilters) ([]*Invoice, int64, error) {
	var invoices []*Invoice
	var total int64

	query := DB.Table("invoices").
		Select("invoices.*, users.username").
		Joins("LEFT JOIN users ON invoices.user_id = users.id")

	if filters.UserId > 0 {
		query = query.Where("invoices.user_id = ?", filters.UserId)
	}
	if filters.Status != "" {
		query = query.Where("invoices.status = ?", filters.Status)
	}
	if kw := strings.TrimSpace(filters.Keyword); kw != "" {
		like := "%%" + kw + "%%"
		query = query.Where("invoices.title LIKE ? OR users.username LIKE ? OR invoices.email LIKE ?", like, like, like)
	}

	countQuery := DB.Model(&Invoice{})
	if filters.UserId > 0 {
		countQuery = countQuery.Where("user_id = ?", filters.UserId)
	}
	if filters.Status != "" {
		countQuery = countQuery.Where("status = ?", filters.Status)
	}
	if err := countQuery.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	err := query.Order("invoices.id desc").
		Limit(pageInfo.GetPageSize()).
		Offset(pageInfo.GetStartIdx()).
		Find(&invoices).Error
	return invoices, total, err
}

// GetInvoiceableTopUps 获取用户可开票的充值记录（已成功且未开票）
// 兼容旧数据：invoiced 列新增前的记录为 NULL，等价于 false
func GetInvoiceableTopUps(userId int) ([]*TopUp, error) {
	var topups []*TopUp
	err := DB.Where("user_id = ? AND status = ? AND (invoiced = ? OR invoiced IS NULL)",
		userId, common.TopUpStatusSuccess, false).
		Order("id desc").
		Find(&topups).Error
	return topups, err
}

// GetInvoiceTopUps 根据发票的 topup_ids 字符串查询关联充值记录
func GetInvoiceTopUps(topUpIdsStr string) ([]*TopUp, error) {
	ids := parseTopUpIds(topUpIdsStr)
	if len(ids) == 0 {
		return []*TopUp{}, nil
	}
	var topups []*TopUp
	err := DB.Where("id IN ?", ids).Order("id desc").Find(&topups).Error
	return topups, err
}

// parseTopUpIds 解析逗号分隔的充值ID字符串
func parseTopUpIds(s string) []int {
	var ids []int
	for _, part := range strings.Split(s, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		id, err := strconv.Atoi(part)
		if err == nil && id > 0 {
			ids = append(ids, id)
		}
	}
	return ids
}

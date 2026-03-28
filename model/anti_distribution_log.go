package model

import (
	"strings"

	"github.com/QuantumNous/new-api/common"
)

type AntiDistributionLog struct {
	Id            int    `json:"id" gorm:"primaryKey"`
	CreatedAt     int64  `json:"created_at" gorm:"bigint;index:idx_anti_distribution_created_at"`
	Layer         string `json:"layer" gorm:"type:varchar(16);index"`
	Action        string `json:"action" gorm:"type:varchar(16);index"`
	Reason        string `json:"reason" gorm:"type:varchar(64);index"`
	RequestHost   string `json:"request_host" gorm:"type:varchar(255);index"`
	OriginHost    string `json:"origin_host" gorm:"type:varchar(255);index"`
	RefererHost   string `json:"referer_host" gorm:"type:varchar(255);index"`
	Method        string `json:"method" gorm:"type:varchar(16)"`
	Path          string `json:"path" gorm:"type:varchar(255);index"`
	ClientIP      string `json:"client_ip" gorm:"type:varchar(64)"`
	UserAgent     string `json:"user_agent" gorm:"type:text"`
	RequestID     string `json:"request_id" gorm:"type:varchar(64);index"`
	MatchedSource string `json:"matched_source" gorm:"type:varchar(16)"`
}

type AntiDistributionLogQuery struct {
	Action string
	Reason string
	Layer  string
}

func RecordAntiDistributionLog(log *AntiDistributionLog) {
	if log == nil || LOG_DB == nil {
		return
	}
	log.CreatedAt = common.GetTimestamp()
	_ = LOG_DB.Create(log).Error
}

func GetAntiDistributionLogs(pageInfo *common.PageInfo, query AntiDistributionLogQuery) ([]*AntiDistributionLog, int64, error) {
	tx := LOG_DB.Model(&AntiDistributionLog{})
	if tx == nil {
		return []*AntiDistributionLog{}, 0, nil
	}
	if query.Action != "" {
		tx = tx.Where("action = ?", strings.TrimSpace(query.Action))
	}
	if query.Reason != "" {
		tx = tx.Where("reason = ?", strings.TrimSpace(query.Reason))
	}
	if query.Layer != "" {
		tx = tx.Where("layer = ?", strings.TrimSpace(query.Layer))
	}

	var total int64
	if err := tx.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	var logs []*AntiDistributionLog
	err := tx.Order("created_at desc").Order("id desc").
		Offset(pageInfo.GetStartIdx()).
		Limit(pageInfo.GetPageSize()).
		Find(&logs).Error
	return logs, total, err
}

package main

import (
	"fmt"
	"os"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/joho/godotenv"
)

func main() {
	_ = godotenv.Load()
	if os.Getenv("SQL_DSN") == "" {
		fmt.Println("SQL_DSN not set")
		os.Exit(1)
	}

	if err := model.InitDB(); err != nil {
		fmt.Printf("InitDB error: %v\n", err)
		os.Exit(1)
	}
	_ = model.InitLogDB()
	fmt.Printf("DB connected, PostgreSQL=%v\n", common.UsingPostgreSQL)

	db := model.DB

	// 1. Check if the old unique index still exists
	fmt.Println("\n=== Checking index status ===")
	if common.UsingPostgreSQL {
		var count int64
		db.Raw(`SELECT COUNT(*) FROM pg_indexes WHERE tablename = 'support_ticket_trial_applications' AND indexname = 'idx_support_ticket_trial_applications_request_ip'`).Scan(&count)
		if count > 0 {
			fmt.Println("WARNING: Old unique index STILL EXISTS!")
			fmt.Println("Dropping via raw SQL...")
			if err := db.Exec("DROP INDEX IF EXISTS idx_support_ticket_trial_applications_request_ip").Error; err != nil {
				fmt.Printf("Drop failed: %v\n", err)
			} else {
				fmt.Println("Dropped successfully")
			}
		} else {
			fmt.Println("OK: unique index on request_ip does not exist")
		}
	}

	// 2. List all indexes on the table
	if common.UsingPostgreSQL {
		type pgIdx struct {
			Name string `gorm:"column:indexname"`
			Def  string `gorm:"column:indexdef"`
		}
		var idxs []pgIdx
		db.Raw(`SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'support_ticket_trial_applications'`).Scan(&idxs)
		fmt.Println("\nCurrent indexes:")
		for _, idx := range idxs {
			fmt.Printf("  %s\n", idx.Name)
		}
	}

	// 3. Quick stats
	var total int64
	db.Model(&model.SupportTicketTrialApplication{}).Count(&total)
	fmt.Printf("\nTotal trial applications: %d\n", total)

	// 4. Test the create function (non-existent ticket → expect error)
	fmt.Println("\n=== Test: non-existent ticket ===")
	_, _, _, err := model.CreateSupportTicketTrialApplication(999999, 999999, "192.0.2.1")
	fmt.Printf("Result: %v\n", err)

	fmt.Println("\nDone.")
}

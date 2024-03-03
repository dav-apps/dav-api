import nodeCron from "node-cron"

export function setupTasks() {
	nodeCron.schedule("*/10 * * * *", sendNotifications)
}

function sendNotifications() {
	console.log("Send notifications")
}

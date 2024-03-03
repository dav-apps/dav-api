import nodeCron from "node-cron"
import webPush from "web-push"
import { DateTime } from "luxon"
import { prisma } from "../server.js"

webPush.setVapidDetails(
	"mailto:support@dav-apps.tech",
	process.env.WEBPUSH_PUBLIC_KEY,
	process.env.WEBPUSH_PRIVATE_KEY
)

export function setupTasks() {
	nodeCron.schedule("*/10 * * * *", sendNotifications)
}

async function sendNotifications() {
	const notifications = await prisma.notification.findMany({
		where: { time: { lte: new Date() } },
		include: {
			user: {
				include: { sessions: { include: { webPushSubscriptions: true } } }
			}
		}
	})

	for (let notification of notifications) {
		if (notification.title == null || notification.body == null) {
			await prisma.notification.delete({ where: { id: notification.id } })
			continue
		}

		// Send the notification to all web push subscriptions of the user
		for (let session of notification.user.sessions) {
			for (let webPushSubscription of session.webPushSubscriptions) {
				try {
					await webPush.sendNotification(
						{
							endpoint: webPushSubscription.endpoint,
							keys: {
								p256dh: webPushSubscription.p256dh,
								auth: webPushSubscription.auth
							}
						},
						JSON.stringify({
							title: notification.title,
							body: notification.body
						})
					)
				} catch (error) {
					// Delete the web push subscription
					await prisma.webPushSubscription.delete({
						where: { id: webPushSubscription.id }
					})
				}
			}
		}

		if (notification.interval > 0) {
			// Update the notification time
			let newNotificationTime = DateTime.fromJSDate(notification.time)
				.plus({ seconds: notification.interval })
				.toJSDate()

			await prisma.notification.update({
				where: { id: notification.id },
				data: { time: newNotificationTime }
			})
		} else {
			await prisma.notification.delete({ where: { id: notification.id } })
		}
	}
}

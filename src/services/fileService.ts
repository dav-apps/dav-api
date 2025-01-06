import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"

const s3Client = new S3Client({
	endpoint: "https://fra1.digitaloceanspaces.com",
	forcePathStyle: false,
	region: "fra1",
	credentials: {
		accessKeyId: process.env.SPACES_ACCESS_KEY,
		secretAccessKey: process.env.SPACES_SECRET_KEY
	}
})

function getBucketName() {
	if (process.env.ENV == "production") {
		return "dav-backend"
	} else {
		return "dav-backend-dev"
	}
}

export async function upload(
	key: string,
	body: any,
	contentType?: string
): Promise<string> {
	try {
		let result = await s3Client.send(
			new PutObjectCommand({
				Bucket: getBucketName(),
				Key: key,
				Body: body,
				ACL: "public-read",
				ContentType: contentType
			})
		)

		return result.ETag
	} catch (err) {
		console.log("Error", err)
		return null
	}
}

export function getFileLink(key: string) {
	return `https://${getBucketName()}.fra1.cdn.digitaloceanspaces.com/${key}`
}

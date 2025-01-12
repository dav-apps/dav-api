import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3"
import { getSpacesBucketName } from "../utils.js"

const s3Client = new S3Client({
	endpoint: "https://fra1.digitaloceanspaces.com",
	forcePathStyle: false,
	region: "fra1",
	credentials: {
		accessKeyId: process.env.SPACES_ACCESS_KEY,
		secretAccessKey: process.env.SPACES_SECRET_KEY
	}
})

export async function upload(
	key: string,
	body: any,
	contentType?: string
): Promise<string> {
	try {
		let result = await s3Client.send(
			new PutObjectCommand({
				Bucket: getSpacesBucketName(),
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

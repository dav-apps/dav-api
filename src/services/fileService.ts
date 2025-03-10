import {
	HeadObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	DeleteObjectCommand,
	S3Client
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
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

export async function check(key: string): Promise<boolean> {
	try {
		await s3Client.send(
			new HeadObjectCommand({
				Bucket: getSpacesBucketName(),
				Key: key
			})
		)

		return true
	} catch (error) {
		return false
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

export async function remove(key: string) {
	try {
		await s3Client.send(
			new DeleteObjectCommand({
				Bucket: getSpacesBucketName(),
				Key: key
			})
		)
	} catch (error) {
		console.error(error)
	}
}

export async function getFileUrl(key: string): Promise<string> {
	if (!(await check(key))) return null

	return await getSignedUrl(
		s3Client,
		new GetObjectCommand({
			Bucket: getSpacesBucketName(),
			Key: key
		}),
		{ expiresIn: 43200 }
	)
}

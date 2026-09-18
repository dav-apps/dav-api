import {
	HeadObjectCommand,
	GetObjectCommand,
	PutObjectCommand,
	DeleteObjectCommand,
	S3Client
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
export interface FileService {
	check(key: string): Promise<boolean>
	upload(key: string, body: any, contentType?: string): Promise<string>
	remove(key: string): Promise<void>
	getFileUrl(key: string): Promise<string>
}

export function createFileService(
	s3Client: S3Client,
	bucket: string
): FileService {
	async function check(key: string): Promise<boolean> {
		try {
			await s3Client.send(
				new HeadObjectCommand({
					Bucket: bucket,
					Key: key
				})
			)

			return true
		} catch (error) {
			return false
		}
	}

	async function upload(
		key: string,
		body: any,
		contentType?: string
	): Promise<string> {
		try {
			let result = await s3Client.send(
				new PutObjectCommand({
					Bucket: bucket,
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

	async function remove(key: string) {
		try {
			await s3Client.send(
				new DeleteObjectCommand({
					Bucket: bucket,
					Key: key
				})
			)
		} catch (error) {
			console.error(error)
		}
	}

	async function getFileUrl(key: string): Promise<string> {
		if (!(await check(key))) return null

		return await getSignedUrl(
			s3Client,
			new GetObjectCommand({
				Bucket: bucket,
				Key: key
			}),
			{ expiresIn: 43200 }
		)
	}

	return { check, upload, remove, getFileUrl }
}

import type {
	MastraMessageContentV2,
	MastraMessageV2,
} from "@mastra/core/agent";
import type { MastraMessageV1, StorageThreadType } from "@mastra/core/memory";
import {
	MemoryStorage,
	type PaginationInfo,
	type StorageGetMessagesArg,
	type StorageResourceType,
	TABLE_MESSAGES,
	TABLE_RESOURCES,
	TABLE_THREADS,
	type ThreadSortOptions,
} from "@mastra/core/storage";
import type { Firestore } from "firebase-admin/firestore";

export interface MemoryFirestoreConfig {
	db: Firestore;
}

export class MemoryFirestore extends MemoryStorage {
	private db: Firestore;

	constructor(config: MemoryFirestoreConfig) {
		super();
		this.db = config.db;
	}

	async getThreadById({
		threadId,
	}: {
		threadId: string;
	}): Promise<StorageThreadType | null> {
		const docRef = this.db.collection(TABLE_THREADS).doc(threadId);
		const doc = await docRef.get();

		if (!doc.exists) {
			return null;
		}

		return this.deserializeThread(doc.data());
	}

	async getThreadsByResourceId(
		args: { resourceId: string } & ThreadSortOptions,
	): Promise<StorageThreadType[]> {
		const { resourceId, orderBy = "createdAt", sortDirection = "ASC" } = args;

		let query = this.db
			.collection(TABLE_THREADS)
			.where("resourceId", "==", resourceId);

		if (orderBy && sortDirection) {
			query = query.orderBy(orderBy, sortDirection === "ASC" ? "asc" : "desc");
		}

		const snapshot = await query.get();
		return snapshot.docs.map((doc) => this.deserializeThread(doc.data()));
	}

	async getThreadsByResourceIdPaginated(
		args: {
			resourceId: string;
			page: number;
			perPage: number;
		} & ThreadSortOptions,
	): Promise<PaginationInfo & { threads: StorageThreadType[] }> {
		const {
			resourceId,
			page = 1,
			perPage = 20,
			orderBy = "createdAt",
			sortDirection = "ASC",
		} = args;

		let query = this.db
			.collection(TABLE_THREADS)
			.where("resourceId", "==", resourceId);

		if (orderBy && sortDirection) {
			query = query.orderBy(orderBy, sortDirection === "ASC" ? "asc" : "desc");
		}

		// Get total count
		const countSnapshot = await query.count().get();
		const totalCount = countSnapshot.data().count;

		// Get paginated results
		const offset = (page - 1) * perPage;
		const snapshot = await query.offset(offset).limit(perPage).get();

		const threads = snapshot.docs.map((doc) =>
			this.deserializeThread(doc.data()),
		);

		return {
			threads,
			page,
			perPage,
			total: totalCount,
			hasMore: totalCount > offset + perPage,
		};
	}

	async saveThread({
		thread,
	}: {
		thread: StorageThreadType;
	}): Promise<StorageThreadType> {
		const docRef = this.db.collection(TABLE_THREADS).doc(thread.id);
		const now = new Date();

		const threadData = {
			...thread,
			createdAt: thread.createdAt || now,
			updatedAt: now,
		};

		await docRef.set(this.serializeThread(threadData));
		return threadData;
	}

	async updateThread({
		id,
		title,
		metadata,
	}: {
		id: string;
		title: string;
		metadata: Record<string, unknown>;
	}): Promise<StorageThreadType> {
		const docRef = this.db.collection(TABLE_THREADS).doc(id);
		const doc = await docRef.get();

		if (!doc.exists) {
			throw new Error(`Thread ${id} not found`);
		}

		const updates = {
			title,
			metadata,
			updatedAt: new Date(),
		};

		await docRef.update(updates);

		const updatedDoc = await docRef.get();
		return this.deserializeThread(updatedDoc.data());
	}

	async deleteThread({ threadId }: { threadId: string }): Promise<void> {
		// Delete the thread
		await this.db.collection(TABLE_THREADS).doc(threadId).delete();

		// Delete associated messages
		const messagesQuery = this.db
			.collection(TABLE_MESSAGES)
			.where("threadId", "==", threadId);
		const messagesSnapshot = await messagesQuery.get();

		const batch = this.db.batch();
		messagesSnapshot.docs.forEach((doc) => {
			batch.delete(doc.ref);
		});

		if (messagesSnapshot.size > 0) {
			await batch.commit();
		}
	}

	async getMessages(
		args: StorageGetMessagesArg & { format?: "v1" },
	): Promise<MastraMessageV1[]>;
	async getMessages(
		args: StorageGetMessagesArg & { format: "v2" },
	): Promise<MastraMessageV2[]>;
	async getMessages({
		threadId,
		selectBy,
		format = "v2",
	}: StorageGetMessagesArg & {
		format?: "v1" | "v2";
	}): Promise<(MastraMessageV1 | MastraMessageV2)[]> {
		let query = this.db
			.collection(TABLE_MESSAGES)
			.where("threadId", "==", threadId);

		for (const include of selectBy?.include || []) {
			query = query.where("id", "==", include.id);
		}

		query = query.orderBy("createdAt", "asc");

		const snapshot = await query.get();
		const messages = snapshot.docs.map((doc) =>
			this.deserializeMessage(doc.data(), format),
		);

		return messages;
	}

	async getMessagesById(args: {
		messageIds: string[];
		format: "v1";
	}): Promise<MastraMessageV1[]>;
	async getMessagesById(args: {
		messageIds: string[];
		format?: "v2";
	}): Promise<MastraMessageV2[]>;
	async getMessagesById({
		messageIds,
		format = "v2",
	}: {
		messageIds: string[];
		format?: "v1" | "v2";
	}): Promise<(MastraMessageV1 | MastraMessageV2)[]> {
		if (messageIds.length === 0) {
			return [];
		}

		// Firestore 'in' queries are limited to 10 items, so we need to batch
		const batchSize = 10;
		const messages: (MastraMessageV1 | MastraMessageV2)[] = [];

		for (let i = 0; i < messageIds.length; i += batchSize) {
			const batchIds = messageIds.slice(i, i + batchSize);
			const query = this.db
				.collection(TABLE_MESSAGES)
				.where("id", "in", batchIds);
			const snapshot = await query.get();

			const batchMessages = snapshot.docs.map((doc) =>
				this.deserializeMessage(doc.data(), format),
			);
			messages.push(...batchMessages);
		}

		return messages;
	}

	async getMessagesPaginated(
		args: StorageGetMessagesArg & {
			format?: "v1";
		},
	): Promise<PaginationInfo & { messages: MastraMessageV1[] }>;
	async getMessagesPaginated(
		args: StorageGetMessagesArg & {
			format: "v2";
		},
	): Promise<PaginationInfo & { messages: MastraMessageV2[] }>;
	async getMessagesPaginated(
		args: StorageGetMessagesArg & {
			format?: "v1" | "v2";
		},
	): Promise<
		PaginationInfo & { messages: (MastraMessageV1 | MastraMessageV2)[] }
	> {
		const { threadId, selectBy, format = "v2" } = args;
		const { pagination } = selectBy || {};
		const { page = 1, perPage = 20 } = pagination || {};

		let query = this.db
			.collection(TABLE_MESSAGES)
			.where("threadId", "==", threadId);

		if (selectBy?.include) {
			for (const include of selectBy.include) {
				query = query.where("id", "==", include.id);
			}
		}

		query = query.orderBy("createdAt", "asc");

		// Get total count
		const countSnapshot = await query.count().get();
		const totalCount = countSnapshot.data().count;

		// Get paginated results
		const offset = (page - 1) * perPage;
		const snapshot = await query.offset(offset).limit(perPage).get();

		const messages = snapshot.docs.map((doc) =>
			this.deserializeMessage(doc.data(), format),
		);

		return {
			messages,
			page,
			perPage,
			total: totalCount,
			hasMore: totalCount > offset + perPage,
		};
	}

	async saveMessages(args: {
		messages: MastraMessageV1[];
		format?: undefined | "v1";
	}): Promise<MastraMessageV1[]>;
	async saveMessages(args: {
		messages: MastraMessageV2[];
		format: "v2";
	}): Promise<MastraMessageV2[]>;
	async saveMessages(
		args:
			| { messages: MastraMessageV1[]; format?: undefined | "v1" }
			| { messages: MastraMessageV2[]; format: "v2" },
	): Promise<MastraMessageV2[] | MastraMessageV1[]> {
		const { messages } = args;

		if (messages.length === 0) {
			return [];
		}

		const batch = this.db.batch();
		const now = new Date();

		for (const message of messages) {
			const docRef = this.db.collection(TABLE_MESSAGES).doc(message.id);
			const messageData = {
				...message,
				createdAt: message.createdAt || now,
			};

			batch.set(docRef, this.serializeMessage(messageData));
		}

		await batch.commit();

		return messages;
	}

	async updateMessages({
		messages,
	}: {
		messages: (Partial<Omit<MastraMessageV2, "createdAt">> & {
			id: string;
			content?: {
				metadata?: MastraMessageContentV2["metadata"];
				content?: MastraMessageContentV2["content"];
			};
		})[];
	}): Promise<MastraMessageV2[]> {
		const batch = this.db.batch();
		const updatedMessages: MastraMessageV2[] = [];

		for (const message of messages) {
			const docRef = this.db.collection(TABLE_MESSAGES).doc(message.id);
			const doc = await docRef.get();

			if (!doc.exists) {
				throw new Error(`Message ${message.id} not found`);
			}

			const existingMessage = this.deserializeMessage(
				doc.data(),
				"v2",
			) as MastraMessageV2;
			const updates: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> =
				{};

			// Update content fields
			if (message.content) {
				if (message.content.metadata !== undefined) {
					updates["content.metadata"] = message.content.metadata;
				}
				if (message.content.content !== undefined) {
					updates["content.content"] = message.content.content;
				}
			}

			// Update other fields
			for (const [key, value] of Object.entries(message)) {
				if (key !== "id" && key !== "createdAt" && key !== "content") {
					updates[key] = value;
				}
			}

			batch.update(docRef, updates);

			updatedMessages.push({
				...existingMessage,
				...message,
			} as MastraMessageV2);
		}

		await batch.commit();
		return updatedMessages;
	}

	async deleteMessages(messageIds: string[]): Promise<void> {
		if (messageIds.length === 0) {
			return;
		}

		const batchSize = 500;

		for (let i = 0; i < messageIds.length; i += batchSize) {
			const batch = this.db.batch();
			const batchIds = messageIds.slice(i, i + batchSize);

			for (const id of batchIds) {
				const docRef = this.db.collection(TABLE_MESSAGES).doc(id);
				batch.delete(docRef);
			}

			await batch.commit();
		}
	}

	async getResourceById({
		resourceId,
	}: {
		resourceId: string;
	}): Promise<StorageResourceType | null> {
		const docRef = this.db.collection(TABLE_RESOURCES).doc(resourceId);
		const doc = await docRef.get();

		if (!doc.exists) {
			return null;
		}

		return this.deserializeResource(doc.data());
	}

	async saveResource({
		resource,
	}: {
		resource: StorageResourceType;
	}): Promise<StorageResourceType> {
		const docRef = this.db.collection(TABLE_RESOURCES).doc(resource.id);
		const now = new Date();

		const resourceData = {
			...resource,
			createdAt: resource.createdAt || now,
			updatedAt: now,
		};

		await docRef.set(this.serializeResource(resourceData));
		return resourceData;
	}

	async updateResource({
		resourceId,
		workingMemory,
		metadata,
	}: {
		resourceId: string;
		workingMemory?: string;
		metadata?: Record<string, unknown>;
	}): Promise<StorageResourceType> {
		const docRef = this.db.collection(TABLE_RESOURCES).doc(resourceId);
		const doc = await docRef.get();

		if (!doc.exists) {
			throw new Error(`Resource ${resourceId} not found`);
		}

		const updates: Record<string, unknown> = {
			updatedAt: new Date(),
		};

		if (workingMemory !== undefined) {
			updates.workingMemory = workingMemory;
		}

		if (metadata !== undefined) {
			updates.metadata = metadata;
		}

		await docRef.update(updates);

		const updatedDoc = await docRef.get();
		return this.deserializeResource(updatedDoc.data());
	}

	private serializeThread(thread: StorageThreadType): Record<string, unknown> {
		return {
			id: thread.id,
			resourceId: thread.resourceId,
			title: thread.title,
			metadata: thread.metadata || {},
			createdAt: thread.createdAt,
			updatedAt: thread.updatedAt,
		};
	}

	private deserializeThread(
		data: FirebaseFirestore.DocumentData | undefined,
	): StorageThreadType {
		if (!data) {
			throw new Error("Thread data is undefined");
		}

		return {
			id: data.id,
			resourceId: data.resourceId,
			title: data.title,
			metadata: data.metadata || {},
			createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
			updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
		};
	}

	private serializeMessage(
		message: MastraMessageV1 | MastraMessageV2,
	): Record<string, unknown> {
		return {
			...message,
			createdAt: message.createdAt,
		};
	}

	private deserializeMessage(
		data: FirebaseFirestore.DocumentData | undefined,
		format: "v1" | "v2",
	): MastraMessageV1 | MastraMessageV2 {
		if (!data) {
			throw new Error("Message data is undefined");
		}

		const baseMessage = {
			...data,
			createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
		};

		if (format === "v1") {
			return baseMessage as MastraMessageV1;
		}

		return baseMessage as MastraMessageV2;
	}

	private serializeResource(
		resource: StorageResourceType,
	): Record<string, unknown> {
		return {
			id: resource.id,
			workingMemory: resource.workingMemory || "",
			metadata: resource.metadata || {},
			createdAt: resource.createdAt,
			updatedAt: resource.updatedAt,
		};
	}

	private deserializeResource(
		data: FirebaseFirestore.DocumentData | undefined,
	): StorageResourceType {
		if (!data) {
			throw new Error("Resource data is undefined");
		}

		return {
			id: data.id,
			workingMemory: data.workingMemory || "",
			metadata: data.metadata || {},
			createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
			updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
		};
	}
}

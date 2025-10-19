import {
	type PaginationInfo,
	type StorageGetTracesArg,
	TABLE_TRACES,
	TracesStorage,
} from "@mastra/core/storage";
import type { Trace } from "@mastra/core/telemetry";
import type { Firestore } from "firebase-admin/firestore";

export interface TracesFirestoreConfig {
	db: Firestore;
}

export class TracesFirestore extends TracesStorage {
	private db: Firestore;

	constructor(config: TracesFirestoreConfig) {
		super();
		this.db = config.db;
	}

	async getTraces(args: StorageGetTracesArg): Promise<Trace[]> {
		const { fromDate, toDate } = args;

		let query: FirebaseFirestore.Query = this.db.collection(TABLE_TRACES);

		// if (agentId) {
		//   query = query.where('agentId', '==', agentId);
		// }

		if (fromDate) {
			query = query.where("timestamp", ">=", fromDate);
		}

		if (toDate) {
			query = query.where("timestamp", "<=", toDate);
		}

		query = query.orderBy("timestamp", "desc");

		const snapshot = await query.get();
		return snapshot.docs.map((doc) => this.deserializeTrace(doc.data()));
	}

	async getTracesPaginated(
		args: StorageGetTracesArg,
	): Promise<PaginationInfo & { traces: Trace[] }> {
		const { page, perPage, fromDate, toDate } = args;

		let query: FirebaseFirestore.Query = this.db.collection(TABLE_TRACES);

		// if (agentId) {
		//   query = query.where('agentId', '==', agentId);
		// }

		if (fromDate) {
			query = query.where("timestamp", ">=", fromDate);
		}

		if (toDate) {
			query = query.where("timestamp", "<=", toDate);
		}

		query = query.orderBy("timestamp", "desc");

		// Get total count
		const countSnapshot = await query.count().get();
		const totalCount = countSnapshot.data().count;

		// Get paginated results
		const offset = (page - 1) * perPage;
		const snapshot = await query.offset(offset).limit(perPage).get();

		const traces = snapshot.docs.map((doc) =>
			this.deserializeTrace(doc.data()),
		);

		return {
			traces,
			page,
			perPage,
			total: totalCount,
			hasMore: totalCount > offset + perPage,
		};
	}

	async batchTraceInsert(args: {
		records: Record<string, unknown>[];
	}): Promise<void> {
		const { records } = args;

		if (records.length === 0) {
			return;
		}

		const batchSize = 500;

		for (let i = 0; i < records.length; i += batchSize) {
			const batch = this.db.batch();
			const batchRecords = records.slice(i, i + batchSize);

			for (const record of batchRecords) {
				const docRef = record.id
					? this.db.collection(TABLE_TRACES).doc(record.id as string)
					: this.db.collection(TABLE_TRACES).doc();

				batch.set(docRef, this.serializeTrace(record));
			}

			await batch.commit();
		}
	}

	private serializeTrace(
		trace: Record<string, unknown>,
	): Record<string, unknown> {
		return {
			...trace,
			timestamp: trace.timestamp || new Date(),
		};
	}

	private deserializeTrace(
		data: FirebaseFirestore.DocumentData | undefined,
	): Trace {
		if (!data) {
			throw new Error("Trace data is undefined");
		}

		return {
			id: data.id,
			parentSpanId: data.parentSpanId,
			name: data.name,
			traceId: data.traceId,
			attributes: data.attributes,
			links: data.links,
			createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
			scope: data.scope,
			kind: data.kind,
			status: data.status,
			events: data.events || [],
			other: data.other || [],
			startTime: data.startTime?.toDate?.() || new Date(data.startTime),
			endTime: data.endTime?.toDate?.() || new Date(data.endTime),
		} satisfies Trace;
	}
}

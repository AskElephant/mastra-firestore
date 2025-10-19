import type { ScoreRowData, ScoringSource } from "@mastra/core/scores";
import {
	type PaginationInfo,
	ScoresStorage,
	type StoragePagination,
	TABLE_SCORERS,
} from "@mastra/core/storage";
import type { Firestore } from "firebase-admin/firestore";

export interface ScoresFirestoreConfig {
	db: Firestore;
}

export class ScoresFirestore extends ScoresStorage {
	private db: Firestore;

	constructor(config: ScoresFirestoreConfig) {
		super();
		this.db = config.db;
	}

	async getScoreById({ id }: { id: string }): Promise<ScoreRowData | null> {
		const docRef = this.db.collection(TABLE_SCORERS).doc(id);
		const doc = await docRef.get();

		if (!doc.exists) {
			return null;
		}

		return this.deserializeScore(doc.data());
	}

	async saveScore(
		score: Omit<ScoreRowData, "id" | "createdAt" | "updatedAt">,
	): Promise<{ score: ScoreRowData }> {
		const docRef = this.db.collection(TABLE_SCORERS).doc();
		const now = new Date();

		const scoreData: ScoreRowData = {
			...score,
			id: docRef.id,
			createdAt: now,
			updatedAt: now,
		};

		await docRef.set(this.serializeScore(scoreData));
		return { score: scoreData };
	}

	async getScoresByScorerId({
		scorerId,
		entityId,
		entityType,
		source,
		pagination,
	}: {
		scorerId: string;
		entityId?: string;
		entityType?: string;
		source?: ScoringSource;
		pagination: StoragePagination;
	}): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
		let query = this.db
			.collection(TABLE_SCORERS)
			.where("scorerId", "==", scorerId);

		if (entityId) {
			query = query.where("entityId", "==", entityId);
		}

		if (entityType) {
			query = query.where("entityType", "==", entityType);
		}

		if (source) {
			query = query.where("source", "==", source);
		}

		return this.executePaginatedQuery(query, pagination);
	}

	async getScoresByRunId({
		runId,
		pagination,
	}: {
		runId: string;
		pagination: StoragePagination;
	}): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
		const query = this.db.collection(TABLE_SCORERS).where("runId", "==", runId);
		return this.executePaginatedQuery(query, pagination);
	}

	async getScoresByEntityId({
		entityId,
		entityType,
		pagination,
	}: {
		pagination: StoragePagination;
		entityId: string;
		entityType: string;
	}): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
		let query = this.db
			.collection(TABLE_SCORERS)
			.where("entityId", "==", entityId);

		if (entityType) {
			query = query.where("entityType", "==", entityType);
		}

		return this.executePaginatedQuery(query, pagination);
	}

	async getScoresBySpan({
		traceId,
		spanId,
		pagination,
	}: {
		traceId: string;
		spanId: string;
		pagination: StoragePagination;
	}): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
		const query = this.db
			.collection(TABLE_SCORERS)
			.where("traceId", "==", traceId)
			.where("spanId", "==", spanId);

		return this.executePaginatedQuery(query, pagination);
	}

	private async executePaginatedQuery(
		query: FirebaseFirestore.Query,
		pagination: StoragePagination,
	): Promise<{ pagination: PaginationInfo; scores: ScoreRowData[] }> {
		const { page = 1, perPage = 20 } = pagination;

		query = query.orderBy("createdAt", "desc");

		// Get total count
		const countSnapshot = await query.count().get();
		const totalCount = countSnapshot.data().count;

		// Get paginated results
		const offset = (page - 1) * perPage;
		const snapshot = await query.offset(offset).limit(perPage).get();

		const scores = snapshot.docs.map((doc) =>
			this.deserializeScore(doc.data()),
		);

		return {
			scores,
			pagination: {
				page,
				perPage,
				total: totalCount,
				hasMore: totalCount > offset + perPage,
			},
		};
	}

	private serializeScore(score: ScoreRowData): Record<string, unknown> {
		return {
			id: score.id,
			scorerId: score.scorerId,
			entityId: score.entityId,
			entityType: score.entityType,
			source: score.source,
			runId: score.runId,
			traceId: score.traceId,
			spanId: score.spanId,
			score: score.score,
			metadata: score.metadata || {},
			createdAt: score.createdAt,
			updatedAt: score.updatedAt,
		};
	}

	private deserializeScore(
		data: FirebaseFirestore.DocumentData | undefined,
	): ScoreRowData {
		if (!data) {
			throw new Error("Score data is undefined");
		}

		return {
			id: data.id,
			scorerId: data.scorerId,
			entityId: data.entityId,
			entityType: data.entityType,
			source: data.source,
			runId: data.runId,
			traceId: data.traceId,
			spanId: data.spanId,
			score: data.score,
			metadata: data.metadata || {},
			createdAt: data.createdAt?.toDate?.() || new Date(data.createdAt),
			updatedAt: data.updatedAt?.toDate?.() || new Date(data.updatedAt),
			output: data.output || {},
			input: data.input || {},
			entity: data.entity || {},
			scorer: data.scorer || {},
		};
	}
}

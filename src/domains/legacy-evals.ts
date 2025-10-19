import {
	type EvalRow,
	LegacyEvalsStorage,
	type PaginationArgs,
	type PaginationInfo,
	TABLE_EVALS,
} from "@mastra/core/storage";
import type { Firestore } from "firebase-admin/firestore";

export interface LegacyEvalsFirestoreConfig {
	db: Firestore;
}

export class LegacyEvalsFirestore extends LegacyEvalsStorage {
	private db: Firestore;

	constructor(config: LegacyEvalsFirestoreConfig) {
		super();
		this.db = config.db;
	}

	async getEvalsByAgentName(
		agentName: string,
		type?: "test" | "live",
	): Promise<EvalRow[]> {
		let query = this.db
			.collection(TABLE_EVALS)
			.where("agentName", "==", agentName);

		if (type) {
			query = query.where("type", "==", type);
		}

		query = query.orderBy("createdAt", "desc");

		const snapshot = await query.get();
		return snapshot.docs.map((doc) => this.deserializeEval(doc.data()));
	}

	async getEvals(
		options: {
			agentName?: string;
			type?: "test" | "live";
		} & PaginationArgs = {},
	): Promise<PaginationInfo & { evals: EvalRow[] }> {
		const { agentName, type, page = 1, perPage = 20 } = options;

		let query = this.db.collection(TABLE_EVALS) as FirebaseFirestore.Query;

		if (agentName) {
			query = query.where("agentName", "==", agentName);
		}

		if (type) {
			query = query.where("type", "==", type);
		}

		query = query.orderBy("createdAt", "desc");

		// Get total count
		const countSnapshot = await query.count().get();
		const totalCount = countSnapshot.data().count;

		// Get paginated results
		const offset = (page - 1) * perPage;
		const snapshot = await query.offset(offset).limit(perPage).get();

		const evals = snapshot.docs.map((doc) => this.deserializeEval(doc.data()));

		return {
			evals,
			page,
			perPage,
			total: totalCount,
			hasMore: totalCount > offset + perPage,
		};
	}

	private deserializeEval(
		data: FirebaseFirestore.DocumentData | undefined,
	): EvalRow {
		if (!data) {
			throw new Error("Eval data is undefined");
		}

		return {
			agentName: data.agentName,
			input: data.input,
			output: data.output,
			result: data.result || data.score || {},
			metricName: data.metricName || "unknown",
			instructions: data.instructions || "",
			runId: data.runId || "",
			globalRunId: data.globalRunId || "",
			testInfo: data.testInfo,
			createdAt: (
				data.createdAt?.toDate?.() || new Date(data.createdAt)
			).toISOString(),
		};
	}
}

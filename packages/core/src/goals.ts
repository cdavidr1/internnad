import { zeroUuid } from "./test_resources/constants.ts";
import {
    IAgentRuntime,
    type Goal,
    type Objective,
    type UUID,
} from "./types.ts";

export const getGoals = async ({
    runtime,
    id,
    roomId,
    userId,
    onlyInProgress = true,
    count = 5,
}: {
    runtime: IAgentRuntime;
    id?: UUID;
    roomId: UUID;
    userId?: UUID;
    onlyInProgress?: boolean;
    count?: number;
}) => {
    return runtime.databaseAdapter.getGoals({
        agentId: runtime.agentId,
        id,
        roomId,
        userId,
        onlyInProgress,
        count,
    });
};

export const formatGoalsAsString = ({ goals }: { goals: Goal[] }) => {
    const goalStrings = goals.map((goal: Goal) => {
        const header = `Goal: ${goal.name}\nid: ${goal.id}`;
        const objectives =
            "Objectives:\n" +
            goal.objectives
                .map((objective: Objective) => {
                    return `- ${objective.completed ? "[x]" : "[ ]"} ${objective.description} ${objective.completed ? " (DONE)" : " (IN PROGRESS)"}`;
                })
                .join("\n");
        return `${header}\n${objectives}`;
    });
    return goalStrings.join("\n");
};

export const updateGoal = async ({
    runtime,
    goal,
}: {
    runtime: IAgentRuntime;
    goal: Goal;
}) => {
    return runtime.databaseAdapter.updateGoal(goal);
};

export const removeGoal = async ({
    runtime,
    goalId
}: {
    runtime: IAgentRuntime;
    goalId: UUID;
}) => {
    return runtime.databaseAdapter.removeGoal(
        goalId
    );
};

export const createGoal = async ({
    runtime,
    goal,
}: {
    runtime: IAgentRuntime;
    goal: Goal;
}) => {
    return runtime.databaseAdapter.createGoal(goal);
};

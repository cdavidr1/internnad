import { Client, elizaLogger, IAgentRuntime } from "@ai16z/eliza";
import { ClientBase } from "./base.ts";
import { validateTwitterConfig } from "./environment.ts";
import { TwitterInteractionClient } from "./interactions.ts";
import { TwitterPostClient } from "./post.ts";
import { TwitterSearchClient } from "./search.ts";
import { TwitterGiveawayClient } from "./giveaway.ts";

class TwitterManager {
    client: ClientBase;
    post: TwitterPostClient;
    search: TwitterSearchClient;
    interaction: TwitterInteractionClient;
    giveaway: TwitterGiveawayClient;
    constructor(runtime: IAgentRuntime, enableSearch: boolean) {
        this.client = new ClientBase(runtime);
        this.post = new TwitterPostClient(this.client, runtime);

        if (enableSearch) {
            // this searches topics from character file
            elizaLogger.warn("Twitter/X client running in a mode that:");
            elizaLogger.warn("1. violates consent of random users");
            elizaLogger.warn("2. burns your rate limit");
            elizaLogger.warn("3. can get your account banned");
            elizaLogger.warn("use at your own risk");
            this.search = new TwitterSearchClient(this.client, runtime);
        }

        this.interaction = new TwitterInteractionClient(this.client, runtime);
        this.giveaway = new TwitterGiveawayClient(this.client, runtime);
    }
}

export const TwitterClientInterface: Client = {
    async start(runtime: IAgentRuntime) {
        await validateTwitterConfig(runtime);

        elizaLogger.log("Twitter client started");
        elizaLogger.log(this.enableSearch);

        const manager = new TwitterManager(runtime, this.enableSearch);

        // base
        await manager.client.init();

        // post
        await manager.post.start();

        await manager.interaction.start();

        await manager.giveaway.start();

        await manager.search?.start();

        return manager;
    },
    async stop(_runtime: IAgentRuntime) {
        elizaLogger.warn("Twitter client does not support stopping yet");
    },
};

export default TwitterClientInterface;

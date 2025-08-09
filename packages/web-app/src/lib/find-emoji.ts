import { localEmojiMap } from "@/constants/local-emoji";
import * as emoji from 'node-emoji';

export function findEmojiByPartialKey(key: string, fallback: string = "✨"): string {
    const lowerKey = key.toLowerCase();
    // 1. Local exact match
    if (localEmojiMap.has(lowerKey)) {
        return localEmojiMap.get(lowerKey) ?? fallback;
    }
    // 2. Local partial match
    for (const [keyword, emoji] of localEmojiMap) {
        if (lowerKey.includes(keyword.toLowerCase())) {
            return emoji;
        }
    }
    // 3. node-emoji exact match
    if (emoji.has(lowerKey)) {
        return emoji.get(lowerKey) ?? fallback;
    }
    // 4. node-emoji partial match
    const nodeResults = emoji.search(lowerKey);
    if (nodeResults.length > 0) {
        return nodeResults[0].emoji;
    }
    // 5. fallback
    return fallback;
}
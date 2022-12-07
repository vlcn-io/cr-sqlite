/**
 * Handles the details of tracking a stream of changes we're shipping to the server.
 * Ensures:
 * - correct order of delivery
 * - we don't overwhelm the server by sending too many unacked messages
 * - each message states what message it follows
 *
 * This is accomplished by:
 * - Listening to the local db for changes
 * - Generating changesets from those changes
 * - Encoding them in the expected format
 */
export default class ChangeStream {}

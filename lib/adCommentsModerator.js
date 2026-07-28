// Core moderation pass: pulls comments from every monitored ad post, scores
// each with the spam heuristic, and replies + deletes anything over the
// threshold. Shared by the cron endpoint and the admin "run now" button.

import { monitoredPostIds, fetchComments, replyToComment, deleteComment } from './metaComments';
import { isSpam } from './spamDetector';
import { appendModerationEntries, seenCommentIds } from './adCommentsStore';

const SPAM_THRESHOLD = Number(process.env.SPAM_SCORE_THRESHOLD || 50);
const REPLY_MESSAGE =
  process.env.SPAM_REPLY_MESSAGE ||
  "This comment has been flagged as spam and removed. If you have a genuine question, please reach out via our website.";

export async function runModerationPass() {
  const postIds = await monitoredPostIds();
  if (!postIds.length) {
    return {
      ranAt: new Date().toISOString(),
      postsScanned: 0,
      commentsSeen: 0,
      actions: [],
      error: 'No ad posts found — set META_AD_ACCOUNT_ID (and/or META_MONITORED_POST_IDS) so ads can be discovered.',
    };
  }

  const alreadySeen = await seenCommentIds();
  const actions = [];
  let commentsSeen = 0;

  for (const postId of postIds) {
    let comments = [];
    try {
      comments = await fetchComments(postId);
    } catch (err) {
      actions.push({
        commentId: null,
        postId,
        action: 'error',
        error: err.message,
        at: new Date().toISOString(),
      });
      continue;
    }

    for (const comment of comments) {
      commentsSeen += 1;
      if (alreadySeen.has(comment.id)) continue;

      const { spam, score, reasons } = isSpam(comment.message, SPAM_THRESHOLD);
      if (!spam) continue;

      const entry = {
        commentId: comment.id,
        postId,
        author: comment.from?.name || 'unknown',
        message: comment.message,
        score,
        reasons,
        at: new Date().toISOString(),
      };

      try {
        await replyToComment(comment.id, REPLY_MESSAGE);
        entry.replied = true;
      } catch (err) {
        entry.replied = false;
        entry.replyError = err.message;
      }

      try {
        await deleteComment(comment.id);
        entry.deleted = true;
        entry.action = 'replied_and_deleted';
      } catch (err) {
        entry.deleted = false;
        entry.deleteError = err.message;
        entry.action = entry.replied ? 'replied_only' : 'failed';
      }

      actions.push(entry);
    }
  }

  await appendModerationEntries(actions.filter((a) => a.commentId));

  return {
    ranAt: new Date().toISOString(),
    postsScanned: postIds.length,
    commentsSeen,
    actions,
  };
}

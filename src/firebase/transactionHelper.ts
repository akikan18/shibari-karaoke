import { doc, runTransaction, DocumentReference } from 'firebase/firestore';
import { db } from '../firebase';

/**
 * Execute a transaction on a room document
 * Handles boilerplate for getting room snapshot and checking existence
 */
export const roomTransaction = async <T>(
  roomId: string,
  handler: (data: any, ref: DocumentReference, tx: any) => Promise<T>
): Promise<T> => {
  return runTransaction(db, async (tx) => {
    const ref = doc(db, 'rooms', roomId);
    const snap = await tx.get(ref);
    if (!snap.exists()) {
      throw new Error('Room not found');
    }
    return handler(snap.data(), ref, tx);
  });
};

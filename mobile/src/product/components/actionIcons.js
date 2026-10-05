/**
 * The icon for each task move, by key, so the status sheet, the swipe panes
 * and the detail buttons all draw the same picture for the same move.
 */
import React from 'react';
import {
  ArrowLeftRight,
  CheckCheck,
  Check,
  Clock,
  GitBranch,
  Hand,
  Send,
  ThumbsDown,
  ThumbsUp,
  Undo,
} from '../icons';

const ICONS = {
  claim: Hand,
  approve: CheckCheck,
  accept: ThumbsUp,
  sendBack: Undo,
  decline: ThumbsDown,
  delegate: GitBranch,
  transfer: ArrowLeftRight,
  submit: Send,
  complete: Check,
  extension: Clock,
};

export const actionIcon = (name) => ICONS[name] || Check;

export function ActionIcon({ name, size = 18, color }) {
  const Icon = actionIcon(name);
  return <Icon size={size} color={color} strokeWidth={2.25} />;
}

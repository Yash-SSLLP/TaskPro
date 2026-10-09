/**
 * The icon for each task move, by key, so the status sheet, the swipe panes
 * and the detail buttons all draw the same picture for the same move.
 *
 * 'menu' (a swipe that opens the status menu) is the HRMS app's up-and-down
 * swap; 'edit' (a swipe to the assign form) its pencil.
 */
import React from 'react';
import ArrowUpDown from 'lucide-react-native/icons/arrow-up-down';
import {
  ArrowLeftRight,
  CheckCheck,
  Check,
  Clock,
  GitBranch,
  Hand,
  Pencil,
  Send,
  ThumbsDown,
  ThumbsUp,
  Undo,
} from '../icons';

const ICONS = {
  claim: Hand,
  approve: CheckCheck,
  done: CheckCheck,
  accept: ThumbsUp,
  sendBack: Undo,
  decline: ThumbsDown,
  delegate: GitBranch,
  transfer: ArrowLeftRight,
  submit: Send,
  complete: Check,
  extension: Clock,
  menu: ArrowUpDown,
  edit: Pencil,
};

export const actionIcon = (name) => ICONS[name] || Check;

export function ActionIcon({ name, size = 18, color }) {
  const Icon = actionIcon(name);
  return <Icon size={size} color={color} strokeWidth={2.25} />;
}

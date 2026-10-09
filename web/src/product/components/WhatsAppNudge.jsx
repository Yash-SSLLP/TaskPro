/**
 * "WhatsApp" under the reminder bell: opens a WhatsApp chat with the person
 * the bell reaches, the reminder and the task's link typed in. Only for people
 * who agreed to it through a WhatsApp invite link and have a mobile number;
 * the server sends them as `can.whatsappTo`.
 */
import clsx from 'clsx';
import { product } from '../config';
import { formatDateTime } from '../../platform/format';
import { useTz } from '../../platform/session';
import { whatsappChatUrl } from '../../platform/invite';
import { WhatsAppIcon } from '../../platform/ui';
import { isOverdue } from '../lifecycle';

const firstName = (name) => String(name || '').split(' ')[0] || 'there';

export function whatsappReminder(task, to, tz, url) {
  const title = `"${task.title}"${task.code ? ` (${task.code})` : ''}`;
  if (task.can?.nudgeTo === 'approver') {
    return `Hi ${firstName(to.name)}, I've handed in the task ${title} on ${product.name}. Could you review it?\nOpen it: ${url}`;
  }
  const lines = [`Hi ${firstName(to.name)}, a reminder about the task ${title} on ${product.name}.`];
  if (task.dueDate) lines.push(`Due: ${formatDateTime(task.dueDate, tz)}${isOverdue(task) ? ' (overdue)' : ''}`);
  lines.push(`Open it: ${url}`);
  return lines.join('\n');
}

export function WhatsAppNudge({ task, className }) {
  const tz = useTz();
  const people = task.can?.whatsappTo || [];
  if (!people.length) return null;
  const url = `${window.location.origin}/tasks/${task._id}`;
  return (
    <div className={clsx('flex flex-wrap justify-end gap-1.5', className)}>
      {people.map((p) => (
        <a
          key={p.id}
          href={whatsappChatUrl(p.phone, whatsappReminder(task, p, tz, url))}
          target="_blank"
          rel="noopener noreferrer"
          title={`WhatsApp ${p.name} about this task`}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-[#25D366] px-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#1ebe5a]"
        >
          <WhatsAppIcon className="h-4 w-4 shrink-0" color="currentColor" />
          {people.length > 1 ? `WhatsApp ${firstName(p.name)}` : 'WhatsApp'}
        </a>
      ))}
    </div>
  );
}

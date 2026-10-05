/**
 * The pieces a task has been split into — each a real task with its own
 * owner, deadline and place in somebody's list. A row opens the piece; an
 * OPEN piece (nobody named) offers Claim when the server says `can.canClaim`.
 */
import { useState } from 'react';
import { GitBranch, Hand, User, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../platform/ui';
import * as T from '../api';
import { accentStyle, personName } from '../lifecycle';
import { DueChip, OverdueChip, ProgressBar, StatusChip } from './TaskChips';

export function ChildTaskList({ children = [], onChanged, onOpen }) {
  const [claiming, setClaiming] = useState('');
  if (!children.length) return null;
  const done = children.filter((c) => c.status === 'COMPLETED').length;

  const claim = async (piece) => {
    setClaiming(String(piece._id));
    try {
      await T.claimTask(piece._id);
      toast.success('That piece is yours now.');
      onChanged?.();
    } catch (err) {
      toast.error(err.message || 'Could not pick that piece up.');
    } finally {
      setClaiming('');
    }
  };

  return (
    <section className="rounded-2xl border border-line bg-white p-4 shadow-card sm:p-5">
      <h2 className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-ink-soft">
        <GitBranch className="h-3.5 w-3.5" /> Pieces <span className="font-normal normal-case text-ink-faint">{done} of {children.length} done</span>
      </h2>
      <ul className="space-y-2">
        {children.map((piece, i) => {
          const owner = piece.assignees?.[0];
          const ownerName = owner ? owner.name || personName(owner.user) : '';
          return (
            <li key={piece._id}>
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  if (e.target.closest('button')) return;
                  onOpen?.(String(piece._id));
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onOpen?.(String(piece._id));
                  }
                }}
                style={accentStyle(piece)}
                className="w-full cursor-pointer rounded-xl px-3 py-2.5 text-left transition hover:brightness-[.98]"
              >
                <div className="flex flex-wrap items-start gap-2 sm:flex-nowrap">
                  <span className="tnum mt-0.5 shrink-0 text-[11px] font-semibold text-ink-soft">{piece.serial || i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{piece.title}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="inline-flex items-center gap-1 text-[11px] text-ink-soft">
                        {ownerName ? (
                          <>
                            <User className="h-3 w-3" />
                            {ownerName}
                          </>
                        ) : (
                          <>
                            <Users className="h-3 w-3" />
                            Open — nobody has taken it
                          </>
                        )}
                      </span>
                      <StatusChip task={piece} />
                      <OverdueChip task={piece} />
                      {piece.dueDate && <DueChip task={piece} />}
                    </div>
                    {Number(piece.progress) > 0 && <ProgressBar task={piece} className="mt-2 w-full max-w-[16rem]" />}
                  </div>
                  {piece.can?.canClaim && (
                    <Button size="sm" variant="secondary" icon={Hand} loading={claiming === String(piece._id)} onClick={() => claim(piece)} className="basis-full sm:basis-auto">
                      Claim
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

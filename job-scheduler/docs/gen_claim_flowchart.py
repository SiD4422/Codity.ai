import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch, Polygon

BG = "#0B0E14"
PANEL = "#161B26"
BORDER = "#2DD4BF"
TEXT = "#E7EAF0"
SUB = "#8A93A6"
ACCENT_BLUE = "#5B8DEF"
ACCENT_AMBER = "#F5A623"
ACCENT_RED = "#F0596B"

fig, ax = plt.subplots(figsize=(6.4, 8.6))
ax.set_xlim(0, 6.4)
ax.set_ylim(0, 8.6)
ax.axis('off')
fig.patch.set_facecolor(BG)
ax.set_facecolor(BG)

def box(cx, cy, w, h, title, sub=None, color=BORDER):
    x, y = cx - w/2, cy - h/2
    b = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.05,rounding_size=0.07",
                        linewidth=1.6, edgecolor=color, facecolor=PANEL, zorder=2)
    ax.add_patch(b)
    if sub:
        ax.text(cx, cy + 0.13, title, color=TEXT, ha='center', va='center', fontsize=9, fontweight='bold', zorder=3)
        ax.text(cx, cy - 0.16, sub, color=SUB, ha='center', va='center', fontsize=7.3, zorder=3)
    else:
        ax.text(cx, cy, title, color=TEXT, ha='center', va='center', fontsize=9, fontweight='bold', zorder=3)

def diamond(cx, cy, w, h, title, color=ACCENT_AMBER):
    pts = [(cx, cy+h/2), (cx+w/2, cy), (cx, cy-h/2), (cx-w/2, cy)]
    d = Polygon(pts, closed=True, linewidth=1.6, edgecolor=color, facecolor=PANEL, zorder=2)
    ax.add_patch(d)
    ax.text(cx, cy, title, color=TEXT, ha='center', va='center', fontsize=8, fontweight='bold', zorder=3)

def arrow(x1, y1, x2, y2, label=None, color=SUB, lx=None, ly=None):
    a = FancyArrowPatch((x1, y1), (x2, y2), arrowstyle='-|>', mutation_scale=11, color=color, linewidth=1.3, zorder=1)
    ax.add_patch(a)
    if label:
        ax.text(lx if lx is not None else (x1+x2)/2 + 0.25, ly if ly is not None else (y1+y2)/2, label,
                color=color, fontsize=7.3, ha='left', va='center', fontweight='bold')

# Flow
box(3.2, 8.1, 4.4, 0.7, "claim_next_job(queue_id, worker_id)", color=ACCENT_BLUE)
arrow(3.2, 7.75, 3.2, 7.3)

box(3.2, 6.9, 5.0, 0.9, "SELECT candidate job", "queue_id match \u00b7 status queued/scheduled\nrun_at <= now() \u00b7 queue.state = active", color=BORDER)
arrow(3.2, 6.45, 3.2, 6.0)

box(3.2, 5.65, 5.0, 0.7, "AND under concurrency_limit", "running+claimed count < queue limit", color=BORDER)
arrow(3.2, 5.3, 3.2, 4.9)

box(3.2, 4.55, 5.0, 0.7, "ORDER BY priority DESC, run_at ASC", "oldest, highest-priority job first", color=BORDER)
arrow(3.2, 4.2, 3.2, 3.8)

box(3.2, 3.45, 5.0, 0.7, "FOR UPDATE SKIP LOCKED, LIMIT 1", "never blocks on a row another\nworker already grabbed", color=ACCENT_AMBER)
arrow(3.2, 3.1, 3.2, 2.65)

diamond(3.2, 2.15, 3.0, 1.0, "row found?")

arrow(1.7, 2.15, 0.9, 2.15, label=None, color=SUB)
ax.text(0.9, 2.45, "no", color=ACCENT_RED, fontsize=8, fontweight='bold', ha='center')
box(0.9, 1.5, 1.5, 0.7, "RETURN NULL", "worker tries\nnext queue", color=ACCENT_RED)
arrow(0.9, 2.15, 0.9, 1.85)

arrow(4.7, 2.15, 5.4, 2.15)
ax.text(5.4, 2.45, "yes", color=BORDER, fontsize=8, fontweight='bold', ha='center')
box(5.4, 1.5, 1.5, 0.7, "atomic\nUPDATE", "", color=BORDER)
arrow(5.4, 2.15, 5.4, 1.85)

box(3.2, 0.45, 5.0, 0.7, "status='claimed', claimed_by, claimed_at=now(), attempt_count += 1  \u2192  RETURN job", color=ACCENT_BLUE)
arrow(5.4, 1.15, 3.85, 0.75)

ax.set_title("claim_next_job() \u2014 execution flow", color=TEXT, fontsize=13, fontweight='bold', pad=14)
plt.tight_layout()
plt.savefig('/home/claude/job-scheduler/docs/claim-flowchart.png', dpi=160, facecolor=BG, bbox_inches='tight')
print("saved")

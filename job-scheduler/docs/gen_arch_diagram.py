import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

fig, ax = plt.subplots(figsize=(11, 7))
ax.set_xlim(0, 11)
ax.set_ylim(0, 7)
ax.axis('off')

BG = "#0B0E14"
PANEL = "#161B26"
BORDER = "#2DD4BF"
TEXT = "#E7EAF0"
ACCENT_BLUE = "#5B8DEF"
ACCENT_VIOLET = "#9D7BFF"
ACCENT_AMBER = "#F5A623"
fig.patch.set_facecolor(BG)
ax.set_facecolor(BG)

def box(x, y, w, h, label, sub=None, color=BORDER):
    b = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.08,rounding_size=0.08",
                        linewidth=1.6, edgecolor=color, facecolor=PANEL, zorder=2)
    ax.add_patch(b)
    if sub:
        ax.text(x + w/2, y + h/2 + 0.12, label, color=TEXT, ha='center', va='center', fontsize=10.5, fontweight='bold', zorder=3)
        ax.text(x + w/2, y + h/2 - 0.18, sub, color="#8A93A6", ha='center', va='center', fontsize=8, zorder=3)
    else:
        ax.text(x + w/2, y + h/2, label, color=TEXT, ha='center', va='center', fontsize=10.5, fontweight='bold', zorder=3)

def arrow(x1, y1, x2, y2, color="#8A93A6", style='-|>'):
    a = FancyArrowPatch((x1, y1), (x2, y2), arrowstyle=style, mutation_scale=14,
                         color=color, linewidth=1.4, zorder=1)
    ax.add_patch(a)

# Clients
box(0.3, 5.7, 2.0, 0.8, "React Dashboard", color=ACCENT_BLUE)
box(2.6, 5.7, 2.0, 0.8, "API Clients", color=ACCENT_BLUE)

# API layer
box(0.3, 4.0, 4.3, 1.2, "Express API", "auth · routes · rate limit", color=BORDER)
box(4.9, 4.0, 1.8, 1.2, "WebSocket", "live status push", color=ACCENT_VIOLET)

# DB
box(1.2, 2.0, 4.0, 1.2, "PostgreSQL", "jobs · queues · workers · logs", color=BORDER)
box(5.5, 2.0, 2.7, 1.2, "claim_next_job()", "FOR UPDATE SKIP LOCKED", color=ACCENT_AMBER)

# Workers
box(0.3, 0.2, 1.7, 0.9, "Worker 1", color=ACCENT_BLUE)
box(2.2, 0.2, 1.7, 0.9, "Worker 2", color=ACCENT_BLUE)
box(4.1, 0.2, 1.7, 0.9, "Worker N", color=ACCENT_BLUE)
box(6.2, 0.2, 2.2, 0.9, "Cron Scheduler", color=ACCENT_VIOLET)

# labels
ax.text(8.5, 5.9, "Job lifecycle:", color=TEXT, fontsize=9.5, fontweight='bold')
ax.text(8.5, 5.55, "queued/scheduled", color="#8A93A6", fontsize=8.5)
ax.text(8.5, 5.25, "-> claimed -> running", color="#8A93A6", fontsize=8.5)
ax.text(8.5, 4.95, "-> completed", color=ACCENT_BLUE, fontsize=8.5)
ax.text(8.5, 4.65, "   or failed -> retry", color=ACCENT_AMBER, fontsize=8.5)
ax.text(8.5, 4.35, "   or dead_letter", color="#F0596B", fontsize=8.5)

# arrows
arrow(1.3, 5.7, 2.4, 5.2)
arrow(3.6, 5.7, 2.4, 5.2)
arrow(2.4, 4.0, 2.4, 3.2)
arrow(3.6, 4.6, 5.8, 3.2)
arrow(1.3, 2.0, 1.1, 1.1)
arrow(2.9, 2.0, 3.05, 1.1)
arrow(4.9, 2.0, 5.0, 1.1)
arrow(6.9, 2.0, 7.3, 1.1)

ax.set_title("Distributed Job Scheduler — System Architecture", color=TEXT, fontsize=14, fontweight='bold', pad=15)
plt.tight_layout()
plt.savefig('/home/claude/job-scheduler/docs/architecture-diagram.png', dpi=150, facecolor=BG)
print("saved")

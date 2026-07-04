import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

BG = "#0B0E14"
PANEL = "#161B26"
BORDER = "#2DD4BF"
TEXT = "#E7EAF0"
SUB = "#8A93A6"
ACCENT_BLUE = "#5B8DEF"
ACCENT_AMBER = "#F5A623"

fig, ax = plt.subplots(figsize=(11, 3.2))
ax.set_xlim(0, 11)
ax.set_ylim(0, 3.2)
ax.axis('off')
fig.patch.set_facecolor(BG)
ax.set_facecolor(BG)

steps = [
    ("Schema", "design tables", BORDER),
    ("Test it", "migrate live", ACCENT_AMBER),
    ("Claim fn", "SKIP LOCKED", BORDER),
    ("Test it", "40 concurrent\nclaims", ACCENT_AMBER),
    ("API routes", "all endpoints", BORDER),
    ("Test them", "live curl calls", ACCENT_AMBER),
    ("Worker", "poll+execute", BORDER),
    ("Watch it run", "real jobs,\nreal DLQ", ACCENT_AMBER),
    ("Frontend", "dashboard", BORDER),
    ("Build-check", "clean build", ACCENT_AMBER),
]

n = len(steps)
w, h = 0.92, 1.5
gap = (11 - n * w) / (n + 1)
y = 1.0

for i, (title, sub, color) in enumerate(steps):
    x = gap + i * (w + gap)
    b = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.04,rounding_size=0.06",
                        linewidth=1.5, edgecolor=color, facecolor=PANEL, zorder=2)
    ax.add_patch(b)
    ax.text(x + w/2, y + h*0.68, title, color=TEXT, ha='center', va='center', fontsize=8.3, fontweight='bold', zorder=3)
    ax.text(x + w/2, y + h*0.32, sub, color=SUB, ha='center', va='center', fontsize=6.6, zorder=3, linespacing=1.4)
    if i < n - 1:
        x2 = gap + (i+1) * (w + gap)
        a = FancyArrowPatch((x + w, y + h/2), (x2, y + h/2), arrowstyle='-|>', mutation_scale=9,
                             color=SUB, linewidth=1.1, zorder=1)
        ax.add_patch(a)

ax.text(5.5, 2.9, "Build \u2192 verify \u2192 next (Iterative/Incremental), documentation written last", color=TEXT, ha='center', fontsize=9.5, fontweight='bold')

plt.tight_layout()
plt.savefig('/home/claude/job-scheduler/docs/dev-process-diagram.png', dpi=160, facecolor=BG, bbox_inches='tight')
print("saved")

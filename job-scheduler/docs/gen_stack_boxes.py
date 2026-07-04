import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch

BG = "#FFFFFF"
PANEL = "#F2F4F7"
BORDER = "#5B8DEF"
TEXT = "#1A1F2B"
SUB = "#5B6472"

fig, ax = plt.subplots(figsize=(3.0, 4.6))
ax.set_xlim(0, 3.0)
ax.set_ylim(0, 4.6)
ax.axis('off')
fig.patch.set_facecolor(BG)
ax.set_facecolor(BG)

boxes = [
    ("Backend", "Node.js\nExpress\nPostgreSQL"),
    ("Dashboard", "React (Vite)"),
    ("Live Status\nUpdates", "WebSocket"),
]

y = 4.3
for title, sub in boxes:
    h = 0.55 + 0.32 * sub.count("\n")
    y -= h
    b = FancyBboxPatch((0.15, y), 2.7, h, boxstyle="round,pad=0.06,rounding_size=0.08",
                        linewidth=1.4, edgecolor=BORDER, facecolor=PANEL, zorder=2)
    ax.add_patch(b)
    ax.text(1.5, y + h - 0.22, title, color=TEXT, ha='center', va='center', fontsize=10.5, fontweight='bold', zorder=3)
    ax.text(1.5, y + h/2 - 0.14, sub, color=SUB, ha='center', va='center', fontsize=9, zorder=3, linespacing=1.6)
    y -= 0.22

plt.tight_layout()
plt.savefig('/home/claude/job-scheduler/docs/stack-boxes.png', dpi=170, facecolor=BG, bbox_inches='tight')
print("saved")

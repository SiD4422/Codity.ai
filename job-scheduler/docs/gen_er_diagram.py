import matplotlib.pyplot as plt
from matplotlib.patches import FancyBboxPatch, FancyArrowPatch

fig, ax = plt.subplots(figsize=(12, 8))
ax.set_xlim(0, 12)
ax.set_ylim(0, 8)
ax.axis('off')

BG = "#0B0E14"
PANEL = "#161B26"
TEXT = "#E7EAF0"
HEAD = "#2DD4BF"
fig.patch.set_facecolor(BG)
ax.set_facecolor(BG)

def entity(x, y, w, h, title, fields):
    b = FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.05,rounding_size=0.06",
                        linewidth=1.4, edgecolor=HEAD, facecolor=PANEL, zorder=2)
    ax.add_patch(b)
    ax.text(x + w/2, y + h - 0.22, title, color=HEAD, ha='center', va='center', fontsize=9.5, fontweight='bold', zorder=3)
    ax.plot([x+0.1, x+w-0.1], [y+h-0.4, y+h-0.4], color=HEAD, linewidth=0.8, zorder=3)
    for i, f in enumerate(fields):
        ax.text(x + 0.15, y + h - 0.62 - i*0.24, f, color=TEXT, ha='left', va='center', fontsize=7.8, zorder=3)

def arrow(x1, y1, x2, y2):
    a = FancyArrowPatch((x1, y1), (x2, y2), arrowstyle='-|>', mutation_scale=10,
                         color="#565F73", linewidth=1.1, zorder=1, connectionstyle="arc3,rad=0.05")
    ax.add_patch(a)

entity(0.3, 6.6, 2.0, 1.1, "ORGANIZATIONS", ["id (PK)", "name"])
entity(2.8, 6.6, 2.0, 1.3, "USERS", ["id (PK)", "org_id (FK)", "email", "role"])
entity(5.3, 6.6, 2.2, 1.5, "PROJECTS", ["id (PK)", "org_id (FK)", "api_key", "created_by (FK)"])
entity(8.0, 6.6, 2.2, 1.1, "WORKERS", ["id (PK)", "project_id (FK)", "status"])

entity(5.3, 4.6, 2.2, 1.5, "QUEUES", ["id (PK)", "project_id (FK)", "concurrency_limit", "default_retry_policy_id"])
entity(8.0, 4.6, 2.2, 1.3, "RETRY_POLICIES", ["id (PK)", "strategy", "max_attempts"])

entity(3.8, 2.4, 2.6, 2.0, "JOBS", ["id (PK)", "queue_id (FK)", "type / status", "payload (jsonb)", "retry_policy_id (FK)", "claimed_by (FK)"])
entity(0.3, 2.6, 2.2, 1.3, "SCHEDULED_JOBS", ["id (PK)", "queue_id (FK)", "cron_expression"])

entity(6.8, 2.4, 2.2, 1.5, "JOB_EXECUTIONS", ["id (PK)", "job_id (FK)", "worker_id (FK)", "attempt_number"])
entity(9.3, 2.4, 2.3, 1.3, "DEAD_LETTER_ENTRIES", ["id (PK)", "job_id (FK)", "final_error"])
entity(6.8, 0.3, 2.2, 1.3, "JOB_LOGS", ["id (PK)", "job_execution_id (FK)", "message"])
entity(9.5, 0.3, 2.0, 1.1, "WORKER_HEARTBEATS", ["id (PK)", "worker_id (FK)"])

arrow(1.3, 6.6, 3.5, 7.2)
arrow(3.5, 6.6, 5.4, 7.2)
arrow(4.8, 7.2, 8.1, 7.2)
arrow(6.4, 6.6, 6.4, 6.1)
arrow(9.1, 6.6, 9.1, 5.9)
arrow(6.4, 4.6, 5.1, 4.4)
arrow(6.4, 4.6, 5.5, 3.4)
arrow(9.1, 4.6, 5.9, 3.2)
arrow(6.4, 3.2, 6.9, 3.1)
arrow(6.4, 2.8, 10.4, 3.1)
arrow(8.0, 2.6, 7.9, 1.6)
arrow(9.1, 4.6, 10.5, 1.6)

ax.set_title("Entity-Relationship Diagram (simplified)", color=TEXT, fontsize=14, fontweight='bold', pad=15)
plt.tight_layout()
plt.savefig('/home/claude/job-scheduler/docs/er-diagram.png', dpi=150, facecolor=BG)
print("saved")

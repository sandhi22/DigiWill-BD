from django.core.management.base import BaseCommand

from legacy.services import run_all


class Command(BaseCommand):
    help = "Evaluate every Dead Man's Switch: send reminders, alert nominees, release vaults."

    def handle(self, *args, **options):
        summary = run_all()
        self.stdout.write(self.style.SUCCESS(
            "Checked {checked}: {heads_up} heads-up, {overdue} newly overdue, "
            "{reminded} reminded, {released} released, {errors} errors".format(**summary)
        ))

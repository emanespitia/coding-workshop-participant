"""
Dashboard / reporting endpoint.
"""

from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.reports import service
from app.reports.schemas import Summary, SummaryQuery

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/summary", response_model=Summary)
def summary(query: Annotated[SummaryQuery, Query()], db: DbSession, user: CurrentUser) -> dict:
    """
    Dashboard numbers for the signed-in user.

    * **Admins:** all incidents, plus engineer workload and location hotspots.
    * **Engineers:** incidents assigned to them, plus the open pool size.
    * **Employees:** incidents they reported, plus how quickly staff responded.

    Window metrics (response times, categories, hotspots, trend) use incidents
    reported in the last `days` days.
    """
    return service.summary(db, user, query)

/** An incident's fields as form values. */
export function incidentToForm(incident) {
  return {
    title: incident.title,
    description: incident.description,
    category: incident.category,
    priority: incident.priority,
    building_id: incident.building.id,
    floor_id: incident.floor?.id ?? '',
    seat_id: incident.seat?.id ?? '',
  }
}

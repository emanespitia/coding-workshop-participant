import { Step, StepLabel, Stepper, Typography } from '@mui/material'

import { useBreakpoints } from '../../hooks/useBreakpoints'
import { workflowSteps } from '../../utils/incidentWorkflow'

/** Where the incident is in the workflow (see workflowSteps). */
export default function WorkflowStepper({ incident }) {
  const { isMobile } = useBreakpoints()
  const { steps, active } = workflowSteps(incident)

  return (
    <Stepper
      activeStep={active}
      orientation={isMobile ? 'vertical' : 'horizontal'}
      alternativeLabel={!isMobile}
      aria-label="Progress"
    >
      {steps.map((step, index) => (
        <Step key={step.label} completed={index < active}>
          <StepLabel
            error={step.error}
            optional={step.caption && (
              <Typography variant="caption" sx={{ color: step.error ? 'error.main' : 'text.secondary' }}>
                {step.caption}
              </Typography>
            )}
          >
            {step.label}
          </StepLabel>
        </Step>
      ))}
    </Stepper>
  )
}

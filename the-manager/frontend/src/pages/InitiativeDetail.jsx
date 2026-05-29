import { useParams, useNavigate } from 'react-router-dom';
import { Box, IconButton, Tooltip } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import InitiativeDetailDrawer from '../components/InitiativeDetailDrawer';

export default function InitiativeDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  return (
    <Box sx={{ height: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {/* back breadcrumb */}
      <Box display="flex" alignItems="center" gap={1}>
        <Tooltip title="Go back">
          <IconButton size="small" onClick={() => navigate(-1)} sx={{ color: 'text.secondary' }}>
            <ArrowBack fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>

      {/* full-page drawer content */}
      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <InitiativeDetailDrawer
          initiativeId={id}
          open
          onClose={() => navigate(-1)}
          pageMode
        />
      </Box>
    </Box>
  );
}

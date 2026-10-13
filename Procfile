# Railway / Heroku-style process types (one service per line in Railway dashboard).
# Vercel hosts the Next.js app only — run these on Railway, Fly.io, or a VPS.

worker-render:    npm run worker:render
worker-training:  npm run worker:training
worker-export:    npm run worker:export
worker-das:       npm run worker:das

# Python microservices (set PORT in Railway; use gunicorn in production)
py-otio:      gunicorn --chdir src/services --bind 0.0.0.0:$PORT otio_service:app
py-imf:       gunicorn --chdir src/services --bind 0.0.0.0:$PORT imf_service:app
py-shotgrid:  gunicorn --chdir src/services --bind 0.0.0.0:$PORT shotgrid_service:app
py-exr:       gunicorn --chdir src/services --bind 0.0.0.0:$PORT exr_service:app

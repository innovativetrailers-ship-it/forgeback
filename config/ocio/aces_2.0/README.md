# OCIO ACES 2.0 Config

This directory should contain the OpenColorIO ACES 2.0 configuration bundle.

## Setup

Download the official ACES OCIO config from:
https://github.com/AcademySoftwareFoundation/OpenColorIO-Config-ACES/releases

Extract and place `config.ocio` and the `luts/` subfolder here.

## Structure
```
config/ocio/aces_2.0/
  config.ocio          ← main OCIO config file
  luts/                ← LUT files referenced by config
  matrices/            ← matrix transform files
```

## FFmpeg usage
```bash
ffmpeg -i input.mp4 \
  -vf "ociofiletransform=src_colorspace=sRGB:dst_colorspace=ACES2065-1:config=./config/ocio/aces_2.0/config.ocio" \
  output.mp4
```

## Supported input colorspaces
- sRGB
- Rec.709
- Log3G10 (RED)
- ARRI LogC3
- Sony SLog3
- Panasonic V-Log

## Supported output transforms
- Rec.709
- Rec.2020
- P3-DCI
- ACES2065-1 (archival)

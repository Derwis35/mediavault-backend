import * as fs from 'fs';
import * as path from 'path';
import * as mime from 'mime-types';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Request, Response } from 'express';
import { EvidencesService } from './evidences.service';
import { CreateEvidenceDto } from './dto/create-evidence.dto';
import { EvidenceFiltersDto } from './dto/evidence-filters.dto';
import { SnapshotCreateDto } from './dto/evidence-response.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Audit } from '../../common/decorators/audit.decorator';

interface AuthUser {
  userId: string;
  email: string;
  role: string;
  sessionId: string;
}

@Controller('evidences')
export class EvidencesController {
  constructor(private readonly evidencesService: EvidencesService) {}

  @Get('download/:token')
  @Public()
  async downloadEvidence(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp =
      (typeof forwarded === 'string' ? forwarded : forwarded?.[0])?.split(',')[0]?.trim() ??
      req.ip ??
      '';

    const { absolutePath, hashSha256, storagePath, evidenceId } =
      await this.evidencesService.prepareDownload(token, clientIp);

    if (!fs.existsSync(absolutePath)) {
      res.status(404).json({ message: 'Archivo no disponible en disco' });
      return;
    }

    const ext = path.extname(storagePath);
    const mimeType = mime.lookup(ext) || 'application/octet-stream';

    res.set({
      'Content-Type': mimeType,
      'Content-Disposition': `attachment; filename="${evidenceId}${ext}"`,
      'X-Evidence-Hash': hashSha256,
    });

    fs.createReadStream(absolutePath).pipe(res);
  }

  @Post()
  @Roles('admin', 'supervisor', 'operator')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 500 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('video/') || file.mimetype.startsWith('image/')) {
          cb(null, true);
        } else {
          cb(new BadRequestException('Tipo de archivo no permitido'), false);
        }
      },
    }),
  )
  create(
    @Req() req: Request & { file?: Express.Multer.File },
    @Body() dto: CreateEvidenceDto,
    @CurrentUser() user: AuthUser,
  ) {
    const file = req.file;
    if (!file) throw new BadRequestException('Se requiere un archivo');

    const forwarded = req.headers['x-forwarded-for'];
    const clientIp =
      (typeof forwarded === 'string' ? forwarded : forwarded?.[0])?.split(',')[0]?.trim() ??
      req.ip ??
      '';

    return this.evidencesService.create(file, dto, user.userId, clientIp);
  }

  @Post('snapshot')
  @Roles('admin', 'supervisor', 'operator')
  @HttpCode(HttpStatus.CREATED)
  createSnapshot(@Body() dto: SnapshotCreateDto, @CurrentUser() user: AuthUser) {
    return this.evidencesService.createSnapshot(dto, user.userId);
  }

  @Get()
  @Roles('admin', 'supervisor', 'operator', 'viewer')
  findAll(@Query() filters: EvidenceFiltersDto, @CurrentUser() user: AuthUser) {
    return this.evidencesService.findAll(filters, user.userId, user.role);
  }

  @Get(':id')
  @Roles('admin', 'supervisor', 'operator', 'viewer')
  @Audit('EVIDENCE_VIEWED', 'Evidence')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.evidencesService.findOne(id, user.userId, user.role);
  }

  @Get(':id/verify-integrity')
  @Roles('admin', 'supervisor')
  verifyIntegrity(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.evidencesService.verifyIntegrity(id, user.userId);
  }

  @Get(':id/export')
  @Roles('admin', 'supervisor', 'operator')
  async exportEvidence(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.evidencesService.exportEvidence(id, user.userId);

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(buffer.length),
    });

    res.send(buffer);
  }

  @Delete(':id')
  @Roles('admin')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.evidencesService.remove(id, user.userId);
  }
}

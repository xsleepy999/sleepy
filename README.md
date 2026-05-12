# Database Kampus

Script SQL untuk membuat database dan tabel di XAMPP (MySQL/MariaDB).

## Tabel yang tersedia

| No | Tabel | Deskripsi |
|----|-------|-----------|
| 1 | `prodi` | Data Program Studi (kode_prodi, nama_prodi, akreditasi) |
| 2 | `dosen` | Data Dosen (nidn, nama_dosen, kode_prodi) |
| 3 | `mahasiswa` | Data Mahasiswa (nim, nama_mahasiswa, kode_prodi, angkatan) |

## Cara Menjalankan

1. Buka **XAMPP Control Panel**, lalu start **Apache** dan **MySQL**
2. Buka browser, akses `http://localhost/phpmyadmin`
3. Klik tab **SQL** atau **Import**
4. Copy-paste isi file `database.sql` atau import file tersebut
5. Klik **Go** / **Execute**

## Struktur Relasi

```
prodi (1) ──── (N) dosen
prodi (1) ──── (N) mahasiswa
```

# Reads the words off a scanned PDF using Windows' own machinery.
#
# Windows renders the PDF (Windows.Data.Pdf) and Windows reads the words
# (Windows.Media.Ocr). Both ship with Windows: nothing is installed, there
# is no account or key, and a scanned document never leaves this machine.
#
# It renders AND reads here, in one process, on purpose. The first version
# had Chromium render each page to a PNG and handed those to this script.
# That worked from a shell and hung forever inside the app — with a
# BrowserWindow alive, even `powershell -Command "'hello'"` never came
# back. Doing the whole job in one place removed the problem rather than
# working around it, and deleted the temp files too.
#
#   powershell -STA -File ocr-pdf.ps1 -Path <pdf> [-MaxPages 15] [-Width 2400]

param(
    [Parameter(Mandatory = $true)][string]$Path,
    [int]$MaxPages = 15,
    [int]$Width = 2400
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

# WinRT hands back IAsyncOperation and IAsyncAction; PowerShell cannot
# await either, so borrow the right AsTask overload for each and wait on
# the .NET task. Unwrapped on the way out because Wait throws an
# AggregateException whose message is only "One or more errors occurred",
# which says nothing about what actually broke.
$asTaskOp = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
})[0]

$asTaskAction = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and
    $_.GetParameters().Count -eq 1 -and
    $_.GetParameters()[0].ParameterType.FullName -eq 'Windows.Foundation.IAsyncAction'
})[0]

function Await($operation, $resultType) {
    $task = $asTaskOp.MakeGenericMethod($resultType).Invoke($null, @($operation))
    try { $task.Wait(-1) | Out-Null } catch { throw $_.Exception.GetBaseException() }
    $task.Result
}

function AwaitAction($action) {
    $task = $asTaskAction.Invoke($null, @($action))
    try { $task.Wait(-1) | Out-Null } catch { throw $_.Exception.GetBaseException() }
}

[Windows.Data.Pdf.PdfDocument, Windows.Data, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.StorageFile, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Storage.Streams.InMemoryRandomAccessStream, Windows.Storage, ContentType = WindowsRuntime] | Out-Null
[Windows.Graphics.Imaging.BitmapDecoder, Windows.Graphics, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Ocr.OcrEngine, Windows.Foundation, ContentType = WindowsRuntime] | Out-Null

$engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
if ($null -eq $engine) { throw 'No OCR language is installed on this machine.' }

# A path with forward slashes is rejected here with "The specified path is
# invalid", so hand Windows the path in its own shape.
$full = [System.IO.Path]::GetFullPath($Path)

$file = Await ([Windows.Storage.StorageFile]::GetFileFromPathAsync($full)) ([Windows.Storage.StorageFile])
$pdf = Await ([Windows.Data.Pdf.PdfDocument]::LoadFromFileAsync($file)) ([Windows.Data.Pdf.PdfDocument])

$pageCount = [int]$pdf.PageCount
$toRead = [Math]::Min($pageCount, $MaxPages)

for ($i = 0; $i -lt $toRead; $i++) {
    $page = $pdf.GetPage($i)
    try {
        $stream = New-Object Windows.Storage.Streams.InMemoryRandomAccessStream
        try {
            $options = New-Object Windows.Data.Pdf.PdfPageRenderOptions
            # Width, not a zoom factor: a scan's page can be any size on
            # paper, and what OCR needs is pixels across the text. Measured
            # on a scanned form — 720px of width produced garbled nonsense,
            # 2,000px read cleanly, and past about 3,500px nothing improved.
            $options.DestinationWidth = $Width
            AwaitAction ($page.RenderToStreamAsync($stream, $options))

            $stream.Seek(0)
            $decoder = Await ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
            $bitmap = Await ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
            try {
                $result = Await ($engine.RecognizeAsync($bitmap)) ([Windows.Media.Ocr.OcrResult])
                $lines = @($result.Lines)
                if ($lines.Count -gt 0) {
                    if ($toRead -gt 1) { Write-Output ("--- page " + ($i + 1) + " ---") }
                    foreach ($line in $lines) { Write-Output $line.Text }
                    if ($toRead -gt 1) { Write-Output '' }
                }
            } finally { $bitmap.Dispose() }
        } finally { $stream.Dispose() }
    } finally { $page.Dispose() }
}

if ($pageCount -gt $toRead) {
    Write-Output ('...' + ($pageCount - $toRead) + ' more pages were not read')
}

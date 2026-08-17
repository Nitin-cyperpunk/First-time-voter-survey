$path = "D:\Voter\Referral-Tracking-System\tmp\payout-format-check.xlsx"
$excel = New-Object -ComObject Excel.Application
$excel.Visible = $false
$excel.DisplayAlerts = $false
$excel.AskToUpdateLinks = $false
try {
  $wb = $excel.Workbooks.Open($path)
  $names = @()
  foreach ($s in $wb.Worksheets) { $names += $s.Name }
  $ws = $wb.Worksheets.Item("Payouts")
  $ws.Activate() | Out-Null
  $visible = 0
  $total = $ws.Comments.Count
  foreach ($c in $ws.Comments) { if ($c.Visible) { $visible++ } }
  $widths = @()
  for ($i = 1; $i -le 10; $i++) {
    $widths += [math]::Round($ws.Columns.Item($i).ColumnWidth, 1)
  }
  $header = @()
  for ($i = 1; $i -le 10; $i++) { $header += $ws.Cells.Item(1, $i).Text }
  $c2 = $ws.Range("C2")
  $firstComment = ""
  if ($total -gt 0) { $firstComment = $ws.Comments.Item(1).Text() }
  $c12Prompt = $false
  try {
    $dv = $ws.Range("C12").Validation
    $c12Prompt = [bool]$dv.ShowInput
    $c12Title = $dv.InputTitle
    $c12Msg = $dv.InputMessage
  } catch {
    $c12Title = ""
    $c12Msg = ""
  }
  [pscustomobject]@{
    sheets = ($names -join " | ")
    comments = $total
    commentsVisible = $visible
    freezePanes = [bool]$excel.ActiveWindow.FreezePanes
    splitRow = $excel.ActiveWindow.SplitRow
    autoFilter = [bool]$ws.AutoFilter
    headerRowHeight = $ws.Rows.Item(1).RowHeight
    headerBold = [bool]$ws.Cells.Item(1, 1).Font.Bold
    amountFormat = $c2.NumberFormat
    amountHAlign = [int]$c2.HorizontalAlignment
    colWidths = ($widths -join ",")
    headers = ($header -join " || ")
    a2 = $ws.Range("A2").Text
    b2 = $ws.Range("B2").Text
    c2 = $ws.Range("C2").Text
    firstComment = $firstComment
    c12ShowInput = $c12Prompt
    c12Title = $c12Title
    c12Msg = $c12Msg
  } | ConvertTo-Json -Compress
  $wb.Close($false)
} finally {
  $excel.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($excel) | Out-Null
}

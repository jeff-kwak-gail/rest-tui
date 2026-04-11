import chalk from "chalk";
import { Box, Text } from "ink";

interface ScrollbarProps {
  totalLines: number;
  visibleHeight: number;
  scrollOffset: number;
}

export default function Scrollbar({
  totalLines,
  visibleHeight,
  scrollOffset,
}: ScrollbarProps) {
  const cells: string[] = [];

  if (totalLines <= visibleHeight) {
    // No scrollbar needed, but still take up space for stable layout
    for (let i = 0; i < visibleHeight; i++) {
      cells.push(" ");
    }
  } else {
    const trackHeight = visibleHeight;
    const thumbSize = Math.max(1, Math.round((visibleHeight / totalLines) * trackHeight));
    const maxOffset = totalLines - visibleHeight;
    const thumbPos = Math.round((scrollOffset / maxOffset) * (trackHeight - thumbSize));

    for (let i = 0; i < trackHeight; i++) {
      if (i >= thumbPos && i < thumbPos + thumbSize) {
        cells.push(chalk.gray("┃"));
      } else {
        cells.push(chalk.gray.dim("│"));
      }
    }
  }

  return (
    <Box width={1}>
      <Text>{cells.join("\n")}</Text>
    </Box>
  );
}
